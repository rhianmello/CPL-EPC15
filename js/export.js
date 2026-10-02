(function () {
  async function exportPDF() {
    const button = document.getElementById('export-pdf');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Gerando...';
    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [297, 167.06], compress: true });
      const slides = [...document.querySelectorAll('.slide')];
      const activeIndex = slides.findIndex(slide => slide.classList.contains('active'));
      for (let index = 0; index < slides.length; index += 1) {
        const slide = slides[index];
        slides.forEach(item => item.classList.remove('active'));
        slide.classList.add('active');
        const canvas = await html2canvas(slide, { scale: 2, backgroundColor: '#071321', useCORS: true, logging: false });
        if (index > 0) pdf.addPage([297, 167.06], 'landscape');
        pdf.addImage(canvas.toDataURL('image/jpeg', .93), 'JPEG', 0, 0, 297, 167.06, undefined, 'FAST');
      }
      slides.forEach(item => item.classList.remove('active'));
      slides[Math.max(0, activeIndex)]?.classList.add('active');
      const stamp = new Date().toISOString().slice(0,10);
      pdf.save(`BI_EPC15_${stamp}.pdf`);
    } catch (error) {
      alert('Não foi possível gerar o PDF neste navegador. Tente novamente no Chrome ou Edge atualizado.');
    } finally { button.disabled=false; button.textContent=original; }
  }
  window.PDFExport = { exportPDF };
}());
