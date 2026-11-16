// Copy buttons. A button with `data-copy` puts that text on the clipboard when it is pressed,
// says "Copied" on itself for two seconds, and tells a screen reader through the element marked
// `data-copy-status` (the sentence is the button's `data-copied`).
// The buttons carry `data-js-only` in the markup: without this script they are not shown, and
// the text beside them can be selected and copied by hand as on any page.
const SHOWN_FOR = 2000; // ms

// (not named `status`: outside a module that is a property of the window)
const announcer = document.querySelector<HTMLElement>('[data-copy-status]');

/** Puts `text` on the clipboard; false when the browser would not. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard here: an older browser, or a page that was not opened over https.
    // The older way copies what is selected in a text field.
    const field = document.createElement('textarea');
    field.value = text;
    field.readOnly = true;
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.append(field);
    field.select();
    let done = false;
    try {
      done = document.execCommand('copy');
    } catch {
      done = false;
    }
    field.remove();
    return done;
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-copy]')) {
  const label = button.querySelector<HTMLElement>('[data-copy-label]') ?? button;
  const idle = label.textContent ?? '';
  let timer: number | undefined;

  button.addEventListener('click', async () => {
    const done = await copy(button.dataset.copy ?? '');
    button.focus(); // the older way moved the focus into its text field
    const said = done ? button.dataset.copied ?? 'Copied' : 'Could not copy: select the text and copy it yourself';
    label.textContent = done ? 'Copied' : 'Not copied';
    button.classList.toggle('is-copied', done);
    if (announcer) announcer.textContent = said;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      label.textContent = idle;
      button.classList.remove('is-copied');
      // another button may have spoken since: its sentence stays
      if (announcer && announcer.textContent === said) announcer.textContent = '';
    }, SHOWN_FOR);
  });
}
