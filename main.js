/* ══════════════════════════════════════════
   FUSHUB — Scripts
   Arquivo: main.js
   ══════════════════════════════════════════ */

/* ── NAV: sombra ao rolar ── */
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if (nav) nav.style.boxShadow =
    window.scrollY > 30 ? '0 4px 20px rgba(0,0,0,0.08)' : 'none';
});

/* ── SEARCH WIDGET: tipo de acomodação ── */
function toggleTipo(el) {
  el.classList.toggle('active');
}

/* ── SEARCH WIDGET: slider de preço ── */
function updatePrice(val) {
  const el = document.getElementById('priceVal');
  if (el) el.textContent = 'R$ ' + Number(val).toLocaleString('pt-BR') + '/mês';
  const pct = ((val - 300) / (5000 - 300)) * 100;
  const range = document.getElementById('priceRange');
  if (range) range.style.setProperty('--pct', pct + '%');
}

/* ── SCROLL REVEAL ── */
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const siblings = Array.from(
        entry.target.parentElement.querySelectorAll('.reveal:not(.visible)')
      );
      siblings.forEach((el, i) => {
        setTimeout(() => el.classList.add('visible'), i * 90);
      });
      revealObs.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

/* ── FAQ: accordion ── */
function toggleFaq(item) {
  const isActive = item.classList.contains('active');
  document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
  if (!isActive) item.classList.add('active');
}

/* ── INIT ── */
updatePrice(1500);