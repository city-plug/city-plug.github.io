(async () => {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return location.href = 'owner-login.html';
  const { data } = await db.from('businesses').select('id').eq('owner_id', user.id).limit(1);
  if (data && data.length) location.href = 'owner-profile.html';
})();

signupForm.onsubmit = async (e) => {
  e.preventDefault();
  msg.textContent = 'Saving...';
  const { data: { user } } = await db.auth.getUser();
  if (!user) return location.href = 'owner-login.html';

  const blob = await shrink(bizPic.files[0]);
  const path = `profiles/${user.id}-${Date.now()}.jpg`;
  const up = await db.storage.from('product-images').upload(path, blob, { contentType: 'image/jpeg' });
  if (up.error) { msg.textContent = up.error.message; return; }
  const url = db.storage.from('product-images').getPublicUrl(path).data.publicUrl;

  const { error } = await db.from('businesses').insert({
    owner_id: user.id,
    name: bizName.value.trim(),
    bio: bizBio.value.trim(),
    city: bizCity.value.trim(),
    category: bizCategory.value,
    profile_pic: url
  });
  if (error) {
    msg.textContent = error.code === '23505' ? 'That business name is already taken.' : error.message;
    return;
  }
  location.href = 'owner-profile.html';
};
