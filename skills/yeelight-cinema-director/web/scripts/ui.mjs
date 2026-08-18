export function createCinemaUi({ $, state, documentRef = document }) {
  const failureLabels = {
    runtime_write_verification_mismatch: "verification retry",
    runtime_retryable: "temporary Runtime retry",
    runtime_timeout: "temporary Runtime timeout",
    runtime_unavailable: "temporary Runtime unavailable",
    runtime_failed: "temporary Runtime process failure",
    runtime_protocol: "temporary Runtime response failure",
    runtime_unverified: "not acknowledged",
  };

  function animateSpectrum(energy) {
    documentRef.querySelectorAll("#spectrum span").forEach((bar, index) => {
      bar.style.height = `${Math.max(8, Math.round((energy * (0.55 + ((index * 17) % 40) / 100)) * 100))}%`;
    });
  }

  function renderReceipts(rows) {
    const host = $("target-receipts");
    host.replaceChildren();
    for (const row of rows) {
      const item = documentRef.createElement("div");
      item.className = "receipt";
      const title = documentRef.createElement("strong");
      title.textContent = state.devices.find((device) => device.handle === row.handle)?.name || "Selected light";
      const status = documentRef.createElement("span");
      const label = failureLabels[row.reason] || "";
      status.textContent = [row.status || "planned", label].filter(Boolean).join(" - ");
      item.append(title, status);
      host.append(item);
    }
  }

  return { animateSpectrum, renderReceipts, setMessage: (message) => { $("console-message").textContent = message; } };
}
