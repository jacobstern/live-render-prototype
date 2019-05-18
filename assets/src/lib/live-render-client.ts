import io from 'socket.io-client';
import morphdom from 'morphdom';
import {
  ClientReadyPayload,
  InitPayload,
  RegionInit,
  ClientUpdateAckPayload,
  ClickEventPayload,
} from '../../../common/types';

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
  private socket: SocketIOClient.Socket;

  constructor(url: string) {
    const socket = io(url, { autoConnect: false });
    this.socket = socket;
    socket.on('live:init', this.handleInit);
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
    this.emitUpdateAck(updatedRegions);
  };

  private handleClick = (event: MouseEvent) => {
    const target = event.currentTarget as HTMLElement;
    const eventName = target.dataset.liveClick;
    if (eventName) {
      const region = this.getRootRegion(target);
      if (region) {
        this.emitClickEvent(region.id, eventName);
      }
    }
  };

  private emitUpdateAck(updatedRegions: LiveRegion[]): void {
    const payload: ClientUpdateAckPayload = {
      regions: {},
    };
    updatedRegions.forEach(region => {
      if (region.hash) {
        payload.regions[region.id] = { hash: region.hash };
      }
    });
    this.socket.emit('live:updateAck', payload);
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
      region.nodes.forEach(node => {
        div.appendChild(node);
      });
      morphdom(div, '<div>' + source + '</div>', {
        childrenOnly: true,
        onNodeAdded: node => {
          if (node instanceof HTMLElement && node.dataset.liveClick) {
            node.addEventListener('click', this.handleClick);
          }
          return node;
        },
        onNodeDiscarded: node => {
          if (node instanceof HTMLElement) {
            node.removeEventListener('click', this.handleClick);
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
}

export default LiveSocket;
