const PER_PAGE = 6;
let biz, products = [], page = 1;

async function init() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return location.href = 'owner-login.html';

  const { data } = await db.from('businesses').select('*').eq('owner_id', user.id).limit(1);
  if (!data || !data.length) return location.href = 'owner-signup.html';
  biz = data[0];

  profilePic.src = biz.profile_pic;
  ownerName.textContent = biz.name;
  categoryTag.textContent = biz.category;
  statusTag.textContent = biz.approved ? 'Verified ✓' : 'Unverified';
statusTag.className = 'status-tag ' + (biz.approved ? 'ok' : 'pending');

  ownerBio.textContent = biz.bio;

  loadRating();
  loadProducts();
}

async function loadRating() {
  const { data } = await db.from('ratings').select('stars').eq('business', biz.name);
  if (!data || !data.length) { ratingText.textContent = 'No ratings yet'; return; }
  const avg = data.reduce((s, r) => s + r.stars, 0) / data.length;
  const full = Math.round(avg);
  ratingText.textContent = '★'.repeat(full) + '☆'.repeat(5 - full) + ` ${avg.toFixed(1)} (${data.length} ratings)`;
}

async function loadProducts() {
  const { data } = await db.from('products').select('*')
    .eq('business_id', biz.id).order('created_at', { ascending: false });
  products = data || [];
  render();
}

function render() {
  const pages = Math.max(1, Math.ceil(products.length / PER_PAGE));
  if (page > pages) page = pages;
  grid.innerHTML = products.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(p => `
    <div class="card">
      <img class="product-img" src="${esc(p.image_url)}">
      <p>${esc(p.description)}</p>
      <strong>₦${esc(String(p.price))}</strong>
      <button data-id="${p.id}">Delete</button>
    </div>`).join('');
  pageNum.textContent = `Page ${page} of ${pages}`;
  prev.disabled = page === 1;
  next.disabled = page === pages;
}

productForm.onsubmit = async (e) => {
  e.preventDefault();
  const blob = await shrink(pImg.files[0]);
  const path = `products/${biz.id}-${Date.now()}.jpg`;
  const up = await db.storage.from('product-images').upload(path, blob, { contentType: 'image/jpeg' });
  if (up.error) return alert(up.error.message);
  const url = db.storage.from('product-images').getPublicUrl(path).data.publicUrl;

  const { error } = await db.from('products').insert({
    business_id: biz.id, image_url: url, description: pDesc.value.trim(), price: pPrice.value
  });
  if (error) return alert(error.message);
  productForm.reset();
  page = 1;
  loadProducts();
};

grid.onclick = async (e) => {
  const id = e.target.dataset.id;
  if (!id || !confirm('Delete this product?')) return;
  const p = products.find(x => x.id === id);
  const path = p.image_url.split('/product-images/')[1];
  await db.storage.from('product-images').remove([path]);
  await db.from('products').delete().eq('id', id);
  loadProducts();
};

prev.onclick = () => { page--; render(); };
next.onclick = () => { page++; render(); };

init();
