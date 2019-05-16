export type Handler = (namespace: SocketIO.Namespace) => void;

export function handleNamespace(namespace: string, handler: Handler) {
  return (io: SocketIO.Server) => {
    const emitter = io.of(namespace);
    handler(emitter);
  };
}
