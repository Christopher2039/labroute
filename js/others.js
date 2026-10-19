/**
 * MyEla - Developer Products & Ecosystem Loader
 */

document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
});

async function loadProducts() {
  const container = document.getElementById('productsGrid');
  if (!container) return;

  try {
    const response = await fetch('content/products.json');
    if (!response.ok) throw new Error('Could not load products dataset.');

    const products = await response.json();
    renderProducts(products, container);

  } catch (error) {
    console.error(error);
    container.innerHTML = `
      <div class="loading-state">
        <p>Unable to load developer products at this moment. Check back shortly.</p>
      </div>
    `;
  }
}

// Dataset text is escaped before being interpolated into card markup.
function escapeProductText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

// Inline icons keep the preview badge intact even when web fonts are unavailable.
function productIcon(icon) {
  const paths = {
    calculate: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h1m6 0h1m-8 4h1m6 0h1m-8 3h1m6 0h1"/>',
    school: '<path d="m2 9 10-5 10 5-10 5L2 9Zm4 2v6c4 3 8 3 12 0v-6m4-2v8"/>',
    electric_bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>',
    arrow_upward: '<path d="M12 18V4m-6 6 6-6 6 6M5 17v4h14v-4"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[icon] || '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>'}</svg>`;
}

function renderProducts(products, container) {
  if (!products.length) {
    container.innerHTML = '<p class="loading-state">No products registered yet.</p>';
    return;
  }

  container.innerHTML = products.map(item => {
    const text = escapeProductText;
    return `
      <article class="product-card">
        <div class="product-image-container">
          <img src="${text(item.imageUrl || 'assets/product-previews/default.svg')}"
               alt="${text(item.name)} preview illustration" loading="lazy" />
          <div class="product-top-row">
            <span class="product-status-pill">${text(item.status || 'Active')}</span>
            <div class="product-icon-box" aria-hidden="true">
              ${productIcon(item.icon)}
            </div>
          </div>
        </div>

        <div class="product-content-wrapper">
          <div class="product-body">
            <h2 class="product-name">${text(item.name)}</h2>
            <p class="product-tagline">${text(item.tagline)}</p>
            <p class="product-desc">${text(item.description)}</p>
          </div>

          <div class="product-footer">
            <details class="product-details">
              <summary aria-label="Details about ${text(item.name)}">More details</summary>
              <div class="product-details-content">
                <div class="product-tags-row">
                  ${(item.tags || []).map(tag => `<span class="product-tag-chip">#${text(tag.replace(/^#+/, ''))}</span>`).join('')}
                </div>
                <p class="product-dev-credit">Developed by <strong>${text(item.developer)}</strong></p>
              </div>
            </details>
            <a href="${text(item.link)}" target="_blank" rel="noopener noreferrer"
               class="btn-product-launch" aria-label="Open ${text(item.name)} application (opens in a new tab)">
              <span>Open Application</span>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" fill="white" />
                <path d="M5.5 10.5L10.5 5.5M5.5 5.5H10.5V10.5" stroke="#080808" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </a>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // A future product can still render if its supplied preview is unavailable.
  container.querySelectorAll('.product-image-container > img').forEach(image => {
    image.addEventListener('error', () => {
      image.src = 'assets/product-previews/default.svg';
    }, { once: true });
  });
}
