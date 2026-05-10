// Mermaid diagram zoom on click
document.addEventListener('DOMContentLoaded', function() {
  // Wait for Mermaid to render
  setTimeout(function() {
    const mermaidDivs = document.querySelectorAll('.mermaid');
    
    mermaidDivs.forEach(function(div) {
      div.style.cursor = 'pointer';
      div.style.transition = 'transform 0.3s ease';
      
      div.addEventListener('click', function(e) {
        if (this.classList.contains('zoomed')) {
          // Zoom out
          this.classList.remove('zoomed');
          this.style.transform = 'scale(1)';
          this.style.position = 'relative';
          this.style.zIndex = '1';
          this.style.background = 'transparent';
          this.style.padding = '0';
          document.body.style.overflow = 'auto';
        } else {
          // Zoom in
          this.classList.add('zoomed');
          this.style.transform = 'scale(2)';
          this.style.position = 'fixed';
          this.style.top = '50%';
          this.style.left = '50%';
          this.style.transform = 'translate(-50%, -50%) scale(1.8)';
          this.style.zIndex = '9999';
          this.style.background = 'var(--md-default-bg-color)';
          this.style.padding = '2rem';
          this.style.borderRadius = '8px';
          this.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
          this.style.maxWidth = '90vw';
          this.style.maxHeight = '90vh';
          this.style.overflow = 'auto';
          document.body.style.overflow = 'hidden';
        }
      });
    });
  }, 1000);
});
