import io from 'socket.io-client';

function onReady(callback: VoidFunction) {
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    callback();
  } else {
    document.addEventListener('DOMContentLoaded', callback);
  }
}

onReady(() => {
  const socket = io('http://localhost:3000');
  socket.on('hello', (payload: any) => {
    console.log(payload.data);
  });
});
