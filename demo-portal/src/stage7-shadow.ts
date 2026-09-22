/**
 * Stage 7F — unlabelled sensitive values inside open and closed shadow roots.
 *
 * Deliberately different from `src/shadow.ts`, which renders a LABELLED field. The point here is
 * that the value carries no label at all, so detection has to come from the value's own shape and
 * the surrounding structure — and that this still works through both kinds of shadow boundary.
 *
 * The `data-gt` annotations are inside the shadow root, so the eval harness reads them the same
 * way the harvester reaches the values: via `openOrClosedShadowRoot`.
 */
function markup(value: string, category: string, construct: string): string {
  return `
    <style>
      .row { font-size:13px; padding:6px 0; }
      input { padding:6px; border:1px solid #ccc; border-radius:4px; font-size:13px; width:260px; }
    </style>
    <div class="row">
      <span data-gt="${category}" data-gt-label="none" data-gt-construct="${construct}">${value}</span>
    </div>
  `;
}

class Stage7OpenField extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = markup(
      this.getAttribute('value') ?? '',
      this.getAttribute('category') ?? 'NONE',
      'shadow',
    );
  }
}

class Stage7ClosedField extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'closed' }).innerHTML = markup(
      this.getAttribute('value') ?? '',
      this.getAttribute('category') ?? 'NONE',
      'shadow',
    );
  }
}

customElements.define('stage7-open-field', Stage7OpenField);
customElements.define('stage7-closed-field', Stage7ClosedField);
