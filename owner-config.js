const db = supabase.createClient(
  'https://ctqsufsamvayeccndmtm.supabase.co',
  'sb_publishable_FWGp8XdnG44eekvGBhFcOQ_zqhdgE7B'
);

function shrink(file, max = 800) {
  return new Promise(resolve => {
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, max / im.width);
      const c = document.createElement('canvas');
      c.width = im.width * s;
      c.height = im.height * s;
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      c.toBlob(resolve, 'image/jpeg', 0.75);
    };
    im.src = URL.createObjectURL(file);
  });
}

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}
