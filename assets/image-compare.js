if (!customElements.get('t4s-image-compare')) {
  customElements.define('t4s-image-compare', class extends HTMLElement {
    connectedCallback() {
      this.range = this.querySelector('input[type="range"]');
      if (!this.range) return;
      this.updatePosition = () => {
        this.style.setProperty('--compare-position', `${this.range.value}%`);
      };
      this.range.addEventListener('input', this.updatePosition);
      this.updatePosition();
    }

    disconnectedCallback() {
      if (this.range) this.range.removeEventListener('input', this.updatePosition);
    }
  });
}
