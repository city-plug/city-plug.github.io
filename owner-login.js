alert('script loaded: ' + typeof window.supabase);

const supabase = window.supabase.createClient(
  'https://ctqsufsamvayeccndmtm.supabase.co',
  'sb_publishable_FWGp8XdnG44eekvGBhFcOQ_zqhdgE7B'
);

let mode = 'login';
const loginTab = document.getElementById('loginTab');
const signupTab = document.getElementById('signupTab');
const submitBtn = document.getElementById('submitBtn');
const msg = document.getElementById('msg');

loginTab.onclick = () => {
  mode = 'login';
  loginTab.classList.add('active');
  signupTab.classList.remove('active');
  submitBtn.textContent = 'Log in';
};

signupTab.onclick = () => {
  mode = 'signup';
  signupTab.classList.add('active');
  loginTab.classList.remove('active');
  submitBtn.textContent = 'Create account';
};

submitBtn.onclick = async () => {
  const email = document.getElementById('email').value;
  const pw = document.getElementById('pw').value;
  msg.style.color = '#b00020';
  msg.textContent = 'please wait.....';

  if (mode === 'signup') {
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: pw,
      options: { data: { role: 'owner' } }
    });
    if (error) { msg.textContent = error.message; return; }
    msg.style.color = '#1e3d36';
    msg.textContent = 'Check your email to confirm, then log in.';
  } else {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: pw
    });
    if (error) { msg.textContent = error.message; return; }
    window.location.href = 'owner-profile.html';
  }
};
