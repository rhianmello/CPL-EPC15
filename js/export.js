(function () {
  const PAGE_W = 297;
  const PAGE_H = 167.06;

  function cleanName(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9_-]+/g,'_')
      .replace(/^_+|_+$/g,'');
  }

  function fileNameForPresentation() {
    const presentation=document.getElementById('presentation');
    const week=Number(presentation?.dataset?.reportWeek);
    const mode=presentation?.dataset?.presentationMode || 'gerencial';
    if(Number.isFinite(week) && week>0){
      return 'EPC15_Semana_'+week+'_Gerencial_Coordenacao.pdf';
    }
    const stamp=new Date().toISOString().slice(0,10);
    return 'BI_EPC15_'+cleanName(mode)+'_'+stamp+'.pdf';
  }

  async function ensureLibraries() {
    if(!window.html2canvas) throw new Error('html2canvas não foi carregado.');
    if(!window.jspdf?.jsPDF) throw new Error('jsPDF não foi carregado.');
    if(document.fonts?.ready){
      try { await document.fonts.ready; } catch(_) {}
    }
  }

  async function captureSlide(slide) {
    return window.html2canvas(slide,{
      scale:Math.min(2,Math.max(1.25,window.devicePixelRatio || 1)),
      backgroundColor:'#071321',
      useCORS:true,
      allowTaint:false,
      logging:false,
      imageTimeout:15000,
      removeContainer:true,
      foreignObjectRendering:false,
      onclone:doc=>{
        doc.querySelectorAll('.slide').forEach(node=>{
          node.style.boxShadow='none';
          node.style.transition='none';
        });
      }
    });
  }

  async function exportPDF() {
    const button=document.getElementById('export-pdf');
    const original=button?.textContent || 'Exportar PDF';
    if(button){
      button.disabled=true;
      button.textContent='Gerando PDF...';
    }

    const slides=[...document.querySelectorAll('#slides .slide')];
    const activeIndex=slides.findIndex(slide=>slide.classList.contains('active'));

    try{
      await ensureLibraries();
      if(!slides.length) throw new Error('Nenhum slide disponível para exportação.');

      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({
        orientation:'landscape',
        unit:'mm',
        format:[PAGE_W,PAGE_H],
        compress:true,
        putOnlyUsedFonts:true
      });

      for(let index=0;index<slides.length;index+=1){
        const slide=slides[index];
        slides.forEach(item=>item.classList.remove('active'));
        slide.classList.add('active');

        await new Promise(resolve=>requestAnimationFrame(resolve));
        const canvas=await captureSlide(slide);
        if(!canvas?.width || !canvas?.height) throw new Error('Falha ao capturar o slide '+(index+1)+'.');

        if(index>0) pdf.addPage([PAGE_W,PAGE_H],'landscape');
        const image=canvas.toDataURL('image/jpeg',0.92);
        pdf.addImage(image,'JPEG',0,0,PAGE_W,PAGE_H,undefined,'FAST');
      }

      pdf.setProperties({
        title:'BI EPC-15',
        subject:'Relatório semanal do Painel Gerencial e Reunião de Coordenação',
        creator:'BI EPC-15'
      });
      pdf.save(fileNameForPresentation());
      return true;
    }catch(error){
      console.error('Falha ao gerar PDF',error);
      const detail=String(error?.message || '').trim();
      alert('Não foi possível gerar o PDF'+(detail ? ': '+detail : '.')+' Atualize a página e tente novamente.');
      return false;
    }finally{
      slides.forEach(item=>item.classList.remove('active'));
      slides[Math.max(0,activeIndex)]?.classList.add('active');
      if(button){
        button.disabled=false;
        button.textContent=original;
      }
    }
  }

  window.PDFExport={exportPDF};
}());
