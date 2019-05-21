import io from 'socket.io-client';
import morphdom from 'morphdom';
import {
  ClientReadyPayload,
  InitPayload,
  RegionInit,
  ClickEventPayload,
  FullUpdatePayload,
  DiffUpdatePayload,
  FormChangeEventPayload,
  ElementInfo,
  FormInfo,
  LeanFormData,
} from '../../../common/types';
import { applyCompactDiff } from '../../../common/diff';

function onDocumentReady(callback: VoidFunction) {
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    callback();
  } else {
    document.addEventListener('DOMContentLoaded', callback);
  }
}

interface LiveRegion {
  nodes: Node[];
  id: string;
  source?: string;
  hash?: string;
}

const REGION_BEGIN_COMMENT_REGEX = /live-begin: (\S+)/;
const REGION_END_COMMENT_REGEX = /live-end: (\S+)/;

function enumerateLiveRegions(root: Node): LiveRegion[] {
  const liveRegions: LiveRegion[] = [];
  const commentIterator = document.createNodeIterator(root, NodeFilter.SHOW_COMMENT);
  for (
    let node = commentIterator.nextNode();
    node != null;
    node = commentIterator.nextNode()
  ) {
    const comment = node as Comment;
    const commentText = comment.nodeValue;
    if (commentText == null) {
      // Not expected
      continue;
    }
    const beginMatch = commentText.match(REGION_BEGIN_COMMENT_REGEX);
    if (beginMatch != null) {
      const id = beginMatch[1];
      const nodes = [];
      let malformed = false;
      for (let sibling = comment.nextSibling; sibling != null; sibling = sibling.nextSibling) {
        if (sibling.nodeType === Node.COMMENT_NODE) {
          const siblingCommentText = sibling.nodeValue;
          if (siblingCommentText == null) {
            // Not expected
            continue;
          }
          const endMatch = siblingCommentText.match(REGION_END_COMMENT_REGEX);
          if (endMatch != null) {
            const siblingId = endMatch[1];
            if (id !== siblingId) {
              console.warn(
                `Possible malformed live-render output, expected ${id} but found ${siblingId}`
              );
              malformed = true;
            }
            break; // We've enumerated all relevant nodes
          } else {
            // Not a region end comment
            nodes.push(sibling);
          }
        } else {
          nodes.push(sibling);
        }
      }
      if (!malformed) {
        liveRegions.push({ id, nodes });
      }
    }
  }
  return liveRegions;
}

function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

function getLeanFormData(form: HTMLFormElement): LeanFormData {
  // Ported from https://github.com/jimmywarting/FormData/blob/master/FormData.js
  const data: LeanFormData = {};
  const elements = form.elements;
  for (let i = 0; i < elements.length; i++) {
    const element: any = elements[i];
    if (
      element.name === '' ||
      element.disabled ||
      element.type === 'submit' ||
      element.type === 'button'
    )
      continue;
    if (element.type === 'select-multiple' || element.type === 'select-one') {
      const options: HTMLOptionsCollection = element.options;
      for (let i = 0; i < options.length; i++) {
        const option = options[i];
        if (!option.disabled && option.selected) {
          data[element.name] = option.value;
        }
      }
    } else if (element.type === 'checkbox' || element.type === 'radio') {
      if (element.checked) {
        data[element.name] = element.value;
      }
    } else if (element.type === 'textarea') {
      data[element.name] = normalizeLineBreaks(element.value);
    } else {
      data[element.name] = element.value;
    }
  }
  return data;
}

function getElementInfo(element: HTMLElement | SVGElement): ElementInfo {
  return {
    id: element.id,
    dataset: element.dataset,
    nodeName: element.nodeName,
  };
}

function getFormInfo(form: HTMLFormElement): FormInfo {
  return Object.assign(getElementInfo(form), {
    name: form.name,
    data: getLeanFormData(form),
  });
}

export class LiveSocket {
  private liveRegions: Record<string, LiveRegion | undefined> = {};
  private pendingElements: HTMLElement[] = [];
  private socket: SocketIOClient.Socket;

  constructor(url: string) {
    const socket = io(url, { autoConnect: false, transports: ['websocket', 'polling'] });
    this.socket = socket;
    socket.on('live:init', this.handleInit);
    socket.on('live:fullUpdate', this.handleFullUpdate);
    socket.on('live:diffUpdate', this.handleDiffUpdate);
  }

  connect(): SocketIOClient.Socket {
    onDocumentReady(this.initWithDOM.bind(this));
    return this.socket.connect();
  }

  private initWithDOM() {
    this.liveRegions = {};
    enumerateLiveRegions(document.body).forEach(region => {
      this.liveRegions[region.id] = region;
    });
    if (this.socket.connected) {
      this.emitReady();
    } else {
      this.socket.on('connect', this.emitReady.bind(this));
    }
    document.querySelectorAll('[data-live-click]').forEach(element => {
      if (element instanceof HTMLElement) {
        element.addEventListener('click', this.handleClick);
      }
    });
    document.querySelectorAll('[data-live-change]').forEach(element => {
      element.addEventListener('change', this.handleChange);
    });
  }

  private emitReady() {
    const payload: ClientReadyPayload = {
      regionIds: Object.keys(this.liveRegions),
    };
    this.socket.emit('live:ready', payload);
  }

  private handleInit = (payload: InitPayload) => {
    const updatedRegions: LiveRegion[] = [];
    Object.keys(payload.regions).forEach(id => {
      const regionInit = payload.regions[id] as RegionInit;
      const region = this.liveRegions[id];
      if (region) {
        this.morphRegion(region, regionInit.source);
        region.hash = regionInit.hash;
        region.source = regionInit.source;
        updatedRegions.push(region);
      }
    });
  };

  private handleClick = (event: MouseEvent) => {
    event.preventDefault();
    const currentTarget = event.currentTarget as HTMLElement;
    const eventName = currentTarget.getAttribute('data-live-click');
    if (eventName) {
      const region = this.getRootRegion(currentTarget);
      if (region) {
        this.emitClickEvent(region.id, eventName, currentTarget);
        this.applyPendingClass(currentTarget);
        this.pendingElements.push(currentTarget);
      }
    }
  };

  private handleChange = (event: Event) => {
    const currentTarget = event.currentTarget as HTMLFormElement;
    const eventName = currentTarget.dataset.liveChange;
    if (eventName) {
      const region = this.getRootRegion(currentTarget);
      if (region) {
        this.emitFormChangeEvent(region.id, eventName, currentTarget);
      }
    }
  };

  private handleFullUpdate = (payload: FullUpdatePayload) => {
    const region = this.liveRegions[payload.regionId];
    if (region) {
      this.morphRegion(region, payload.source);
      region.source = payload.source;
      region.hash = payload.hash;
    }
  };

  private handleDiffUpdate = (payload: DiffUpdatePayload) => {
    this.resetPendingElements(); // TODO: Make the semantics of "meaningful response from server" clearer
    const region = this.liveRegions[payload.regionId];
    if (region) {
      const source = region.source;
      if (source != null && payload.fromHash === region.hash) {
        const updated = applyCompactDiff(source, payload.diff);
        this.morphRegion(region, updated);
        region.source = updated;
        region.hash = payload.hash;
      } else {
        this.emitDesync(region);
      }
    }
  };

  private emitDesync(region: LiveRegion) {
    this.socket.emit('live:desync', { regionId: region.id });
  }

  private emitClickEvent(
    regionId: string,
    event: string,
    sender: HTMLElement | SVGElement
  ): void {
    const payload: ClickEventPayload = {
      regionId,
      event,
      sender: getElementInfo(sender),
    };
    this.socket.emit('live:clickEvent', payload);
  }

  private emitFormChangeEvent(regionId: string, event: string, sender: HTMLFormElement): void {
    const payload: FormChangeEventPayload = {
      regionId,
      event,
      sender: getFormInfo(sender),
    };
    this.socket.emit('live:formChangeEvent', payload);
  }

  private morphRegion(region: LiveRegion, source: string) {
    if (region.nodes.length === 0) {
      return;
    }
    const lastNode = region.nodes[region.nodes.length - 1];
    const afterSibling = lastNode.nextSibling;
    const div = document.createElement('div');
    const parent = lastNode.parentNode;
    if (parent) {
      const activeElement = document.activeElement;
      region.nodes.forEach(node => {
        div.appendChild(node);
      });
      morphdom(div, '<div>' + source + '</div>', {
        childrenOnly: true,
        onNodeAdded: node => {
          if (node instanceof HTMLElement && node.getAttribute('data-live-click')) {
            node.addEventListener('click', this.handleClick);
          }
          if (
            node instanceof HTMLElement &&
            node.dataset.liveChange &&
            node.tagName === 'FORM'
          ) {
            node.addEventListener('change', this.handleChange);
          }
          return node;
        },
        onNodeDiscarded: node => {
          if (node instanceof HTMLElement) {
            node.removeEventListener('click', this.handleClick);
          }
        },
        onBeforeElUpdated: (fromEl, toEl) => {
          if (toEl.tagName === 'INPUT') {
            // No "controlled" inputs, for now at least
            const fromInput = fromEl as HTMLInputElement;
            const toInput = toEl as HTMLInputElement;
            toInput.value = fromInput.value;
            toInput.checked = fromInput.checked;
          }
          if (typeof fromEl.isEqualNode === 'function' && fromEl.isEqualNode(toEl)) {
            return false;
          }
          return true;
        },
        getNodeKey: (node: any /* Node */) => {
          let key = node.id;
          if (node.dataset && node.dataset.liveKey) {
            key = node.dataset.liveKey;
          }
          return key;
        },
      });
      // We may have added or removed nodes from the template, so recompute region.nodes
      region.nodes = [];
      div.childNodes.forEach(node => {
        region.nodes.push(node);
      });
      region.nodes.forEach(node => {
        parent.insertBefore(node, afterSibling);
      });
      if (activeElement && activeElement !== document.body) {
        const active = activeElement as Record<string, unknown>;
        if (typeof active.focus === 'function') {
          active.focus();
        }
      }
      // Restore pending class if necessary
      this.pendingElements.forEach(element => {
        this.applyPendingClass(element);
      });
    }
  }

  private getRootRegion(element: Element): LiveRegion | undefined {
    return Object.values(this.liveRegions).find(region => {
      if (region == null) {
        return false;
      }
      return region.nodes.some(node => {
        return node.contains(element);
      });
    });
  }

  private applyPendingClass(element: HTMLElement): void {
    const className = this.getPendingClassName(element);
    if (element.classList) {
      element.classList.add(className);
    }
  }

  private removePendingClass(element: HTMLElement): void {
    const className = this.getPendingClassName(element);
    if (element.classList) {
      element.classList.remove(className);
    }
  }

  private getPendingClassName(element: HTMLElement): string {
    let className = element.getAttribute('data-live-pending-class');
    if (!className) {
      className = 'live-pending';
    }
    return className;
  }

  private resetPendingElements(): void {
    this.pendingElements.forEach(element => {
      this.removePendingClass(element);
    });
    this.pendingElements = [];
  }
}

export default LiveSocket;
