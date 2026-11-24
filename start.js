(() => {
  const notice = document.getElementById('network-notice');
  let dismissed = false;
  try {
    dismissed = localStorage.getItem('voxel.network.notice') === '1';
  } catch {}
  notice.hidden = dismissed;
  notice.querySelector('button').onclick = () => {
    notice.hidden = true;
    try {
      localStorage.setItem('voxel.network.notice', '1');
    } catch {}
  };
})();
