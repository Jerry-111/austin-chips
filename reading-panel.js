const byId = id => document.getElementById(id);

export function connectReadingPanel({ getSectionId, pause, restore }) {
  const dialog = byId('research-dialog');
  const panelBody = byId('panel-body');
  const closeButton = byId('close-research');
  const readButton = byId('read-section');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const data = fetch('essay-content.json?v=10')
    .then(response => response.ok ? response.json() : null)
    .catch(() => null);
  let returnFocus;
  let returnScroll = 0;
  let opening = false;
  let motion = null;

  function addSources(section, references) {
    const list = byId('research-sources');
    list.replaceChildren();
    if (!section.references.length) return;
    const heading = document.createElement('h3');
    heading.textContent = 'Sources for this section';
    list.append(heading);
    for (const index of section.references) {
      const reference = references.find(ref => ref.index === index);
      const url = reference?.text.match(/https?:\/\/\S+/)?.[0];
      if (!url) continue;
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = reference.text.replace(url, '').trim();
      list.append(link);
    }
  }

  function addStudyMap(visible) {
    const container = byId('research-figure');
    container.replaceChildren();
    if (!visible) return;
    const figure = document.createElement('figure');
    const image = document.createElement('img');
    image.src = 'assets/chambliss-figure1-full.jpg';
    image.width = 793;
    image.height = 625;
    image.style.height = 'auto';
    image.alt = 'Original Figure 1. Modeled exposure in Travis County, including four anonymized facilities and the complete legend.';
    const credit = document.createElement('figcaption');
    credit.innerHTML = 'Travis County · Figure 1, Chambliss et al. (2026). Colors show modeled exposure scores for census tracts. A–D identify the four anonymized facilities. <a href="https://doi.org/10.1007/s11111-026-00524-y">Study ↗</a> · <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/">CC BY-NC-ND 4.0</a>';
    figure.append(image, credit);
    container.append(figure);
  }

  async function openReading(id, trigger, focusMap = false) {
    if (opening || dialog.open) return;
    opening = true;
    pause();
    returnFocus = trigger;
    returnScroll = scrollY;
    const essay = await data;
    opening = false;
    const section = essay?.sections.find(item => item.id === id);
    if (!section) { location.href = 'essay.html#' + id; return; }
    byId('research-title').textContent = section.title;
    const paragraphs = section.paragraphs.map(item => {
      const element = document.createElement('p');
      element.dataset.sourceParagraph = item.index;
      element.textContent = item.text;
      return element;
    });
    byId('research-copy').replaceChildren(...paragraphs);
    addSources(section, essay.references);
    addStudyMap(id === 'health');
    byId('full-section-link').href = 'essay.html#' + id;
    document.body.classList.add('dialog-open');
    dialog.showModal();
    panelBody.scrollTop = 0;
    closeButton.focus({preventScroll:true});
    if (focusMap) {
      const figure = byId('research-figure');
      figure.tabIndex = -1;
      figure.focus({preventScroll:true});
      panelBody.scrollTop = figure.getBoundingClientRect().top - panelBody.getBoundingClientRect().top - 18;
    }
    if (!reducedMotion.matches) {
      motion = dialog.animate(
        [{transform:'translateX(min(16%, 100px))', opacity:.62}, {transform:'none', opacity:1}],
        {duration:280, easing:'cubic-bezier(.18,.72,.18,1)'}
      );
    }
  }

  function dismiss() {
    if (!dialog.open || dialog.hasAttribute('data-leaving')) return;
    if (reducedMotion.matches) { dialog.close(); return; }
    const {transform, opacity} = getComputedStyle(dialog);
    motion?.cancel();
    dialog.setAttribute('data-leaving', '');
    motion = dialog.animate(
      [{transform, opacity}, {transform:'translateX(min(13%, 85px))', opacity:0}],
      {duration:160, easing:'cubic-bezier(.4,0,.8,.3)', fill:'forwards'}
    );
    motion.onfinish = () => { if (dialog.open) dialog.close(); };
  }

  function outside(event) {
    if (event.target !== dialog) return false;
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX >= bounds.right ||
      event.clientY < bounds.top || event.clientY >= bounds.bottom;
  }

  readButton.addEventListener('click', () => openReading(getSectionId(), readButton));
  document.addEventListener('open-study-map', event => {
    openReading('health', event.target.querySelector('button') || readButton, true);
  });
  closeButton.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dismiss();
  });
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', event => { pressedBackdrop = outside(event); });
  dialog.addEventListener('click', event => {
    if (pressedBackdrop && outside(event)) dismiss();
    pressedBackdrop = false;
  });
  dialog.addEventListener('close', () => {
    motion?.cancel();
    motion = null;
    dialog.removeAttribute('data-leaving');
    document.body.classList.remove('dialog-open');
    restore(returnScroll);
    returnFocus?.focus({preventScroll: true});
  });
  return dialog;
}
