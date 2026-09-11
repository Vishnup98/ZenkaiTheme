// Mobile corner release: 2026-09-12.
(() => {
  const storageKey = 'zenkai-welcome-subscribed-v1';
  function init(root) {
    if (root.dataset.ready) return;
    const form = root.querySelector('[data-welcome-form]');
    if (!form) return;
    root.dataset.ready = 'true';
    const signup = root.querySelector('[data-welcome-signup]');
    const success = root.querySelector('[data-welcome-success]');
    const error = root.querySelector('[data-welcome-error]');
    const emailInput = form.elements.email;
    const submit = form.querySelector('[type="submit"]');
    const dialog = root.querySelector('dialog');
    const opener = root.querySelector('[data-welcome-open]');
    if (!dialog || !opener || typeof dialog.showModal !== 'function') return;
    opener.hidden = false;
    opener.addEventListener('click', () => {
      dialog.showModal();
      opener.setAttribute('aria-expanded', 'true');
      if (signup.hidden) success.focus({preventScroll:true});
    });
    root.querySelector('[data-welcome-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      opener.setAttribute('aria-expanded', 'false');
      opener.focus({preventScroll:true});
    });
    let busy = false;
    function showSuccess(focus) {
      opener.textContent = 'Get $5 Off';
      signup.hidden = true;
      success.hidden = false;
      if (focus) success.focus({preventScroll:true});
    }
    emailInput.disabled = false;
    submit.disabled = false;
    try { if (localStorage.getItem(storageKey)) showSuccess(false); } catch (_) {}
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy || !form.reportValidity()) return;
      busy = true;
      submit.disabled = true;
      submit.textContent = 'Joining…';
      error.hidden = true;
      const email = emailInput.value.trim();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch('https://a.klaviyo.com/client/subscriptions?company_id=TZMEdC', {
          method: 'POST',
          headers: {'Content-Type':'application/vnd.api+json', 'revision':'2026-07-15'},
          signal: controller.signal,
          body: JSON.stringify({data:{type:'subscription',attributes:{custom_source:'Zenkai side-tab welcome',profile:{data:{type:'profile',attributes:{email,properties:{zenkai_signup_source:'side_tab_welcome'},subscriptions:{email:{marketing:{consent:'SUBSCRIBED'}}}}}}},relationships:{list:{data:{type:'list',id:'V6PYfE'}}}}})
        });
        if (!response.ok) throw new Error(response.status === 429 ? 'rate_limit' : 'signup_failed');
        // Identify this consenting subscriber for subsequent onsite recovery events.
        window._learnq = window._learnq || [];
        window._learnq.push(['identify', {'$email':email}]);
        try { localStorage.setItem(storageKey, String(Date.now())); } catch (_) {}
        showSuccess(true);
      } catch (reason) {
        error.textContent = reason.message === 'rate_limit'
          ? 'Please wait a moment, then try again.'
          : 'We couldn’t confirm your signup. Please try again. If you already received the welcome email, you’re all set.';
        error.hidden = false;
      } finally {
        clearTimeout(timer);
        busy = false;
        submit.disabled = false;
        submit.textContent = 'Get my $5 →';
      }
    });
    root.querySelector('[data-welcome-copy]').addEventListener('click', async () => {
      const status = root.querySelector('[data-welcome-copy-status]');
      try { await navigator.clipboard.writeText('WELCOME5'); status.textContent = 'Code copied.'; }
      catch (_) { status.textContent = 'Select WELCOME5 above to copy it.'; }
    });
  }
  document.querySelectorAll('[data-zenkai-welcome]').forEach(init);
  document.addEventListener('shopify:section:load', event => event.target.querySelectorAll('[data-zenkai-welcome]').forEach(init));
})();
