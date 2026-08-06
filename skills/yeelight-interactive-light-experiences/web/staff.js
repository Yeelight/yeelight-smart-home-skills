const form = document.querySelector('#provider-form');
const status = document.querySelector('#staff-status');
const base = window.location.origin;

function values() {
  const data = new FormData(form);
  return {
    baseUrl: String(data.get('baseUrl') || ''),
    apiKey: String(data.get('apiKey') || ''),
    model: String(data.get('model') || ''),
    mode: String(data.get('mode') || ''),
  };
}

function show(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

async function call(path, payload) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || 'Provider setup failed.');
  return body;
}

document.querySelector('#test-provider').addEventListener('click', async () => {
  try {
    show('Testing the provider without saving it...');
    const input = values();
    const result = await call('/api/staff/provider/test', input);
    show(result.result?.ok ? 'Connection and response schema passed.' : 'Connection test did not pass.', !result.result?.ok);
  } catch (error) {
    show(error.message, true);
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    show('Testing and saving the provider...');
    const input = values();
    await call('/api/staff/provider/configure', input);
    form.querySelector('[name="apiKey"]').value = '';
    show('Provider saved. Visitor pages now use it automatically.');
  } catch (error) {
    show(error.message, true);
  }
});
