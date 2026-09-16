// Demo custom elements exercising open vs. closed shadow roots for the Stage 1 harvester.
class AegisOpenField extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = fieldMarkup(this.getAttribute('label') ?? '', this.getAttribute('value') ?? '');
  }
}

class AegisClosedField extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'closed' }).innerHTML = fieldMarkup(this.getAttribute('label') ?? '', this.getAttribute('value') ?? '');
  }
}

function fieldMarkup(label: string, value: string): string {
  const id = `f-${Math.random().toString(36).slice(2, 8)}`;
  return `
    <style>
      label { display:block; font-size:13px; font-weight:600; margin-bottom:4px; }
      input { padding:8px; border:1px solid #ccc; border-radius:4px; font-size:14px; width: 260px; }
    </style>
    <label for="${id}">${label}</label>
    <input id="${id}" type="text" value="${value}" />
  `;
}

customElements.define('aegis-open-field', AegisOpenField);
customElements.define('aegis-closed-field', AegisClosedField);
