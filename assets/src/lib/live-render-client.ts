import io from 'socket.io-client';
import morphdom from 'morphdom';
import {
  ClientReadyPayload,
  InitPayload,
  RegionInit,
  ClickEventPayload,
  FullUpdatePayload,
  DiffUpdatePayload,
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
    const target = event.currentTarget as HTMLElement;
    const eventName = target.getAttribute('data-live-click');
    if (eventName) {
      const region = this.getRootRegion(target);
      if (region) {
        this.emitClickEvent(region.id, eventName);
        this.applyPendingClass(target);
        this.pendingElements.push(target);
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

  private emitClickEvent(regionId: string, eventName: string): void {
    const payload: ClickEventPayload = { regionId, eventName };
    this.socket.emit('live:clickEvent', payload);
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
          return node;
        },
        onNodeDiscarded: node => {
          if (node instanceof HTMLElement) {
            node.removeEventListener('click', this.handleClick);
          }
        },
        onBeforeElUpdated: (fromEl, toEl) => {
          if (fromEl.isEqualNode && fromEl.isEqualNode(toEl)) {
            return false;
          }
          return true;
        },
        getNodeKey: node => {
          if (node instanceof HTMLElement) {
            const key = node.getAttribute('data-live-key') || node.id;
            if (key) {
              return key;
            }
          }
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
