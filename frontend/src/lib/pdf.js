import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { brl, dataBR, mesExtenso } from './format.js';
import { slug } from './csv.js';

const VERDE = [20, 101, 59];
const CINZA = [124, 135, 118];

/* Relatório do mês em PDF: capa curta com os números, presença por
   atleta e o caixa do período. Sai como download de verdade. */
export function relatorioMensalPDF({ escolinha, competencia, resumo, alunos, mensalidades, lancamentos }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const largura = doc.internal.pageSize.getWidth();
  const mes = mesExtenso(competencia);

  doc.setFillColor(...VERDE);
  doc.rect(0, 0, largura, 92, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold').setFontSize(18);
  doc.text(escolinha.nome, 40, 42);
  doc.setFont('helvetica', 'normal').setFontSize(11);
  doc.text(`Relatório de ${mes}`, 40, 62);
  if (escolinha.cidade) doc.text(escolinha.cidade, 40, 78);

  doc.setTextColor(20);
  const cartoes = [
    ['Atletas ativos', String(resumo.atletas ?? 0)],
    ['Presença média', resumo.frequencia_media != null ? `${resumo.frequencia_media}%` : '—'],
    ['Recebido', brl(resumo.recebido)],
    ['Em atraso', brl(resumo.atrasado)],
  ];
  cartoes.forEach(([rotulo, valor], i) => {
    const x = 40 + i * ((largura - 80) / 4);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...CINZA);
    doc.text(rotulo.toUpperCase(), x, 122);
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(20);
    doc.text(valor, x, 142);
  });

  autoTable(doc, {
    startY: 168,
    head: [['Atleta', 'Turma', 'Presenças', 'Faltas', 'Just.', 'Frequência', 'Mensalidade']],
    body: alunos.map((a) => [
      a.nome,
      a.turma_nome || '—',
      String(a.presencas ?? 0),
      String(a.faltas ?? 0),
      String(a.justificadas ?? 0),
      a.frequencia != null ? `${a.frequencia}%` : '—',
      rotuloCobranca(a),
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: VERDE, fontSize: 8 },
    alternateRowStyles: { fillColor: [244, 247, 242] },
    margin: { left: 40, right: 40 },
  });

  const emAberto = mensalidades.filter((m) => m.status === 'aberta');
  if (emAberto.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 24,
      head: [['Mensalidade em aberto', 'Responsável', 'Vencimento', 'Atraso', 'Valor']],
      body: emAberto.map((m) => [
        m.aluno_nome,
        m.responsavel_nome || '—',
        dataBR(m.vencimento),
        m.dias_atraso > 0 ? `${m.dias_atraso} dias` : 'a vencer',
        brl(m.valor_centavos),
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [168, 56, 42], fontSize: 8 },
      margin: { left: 40, right: 40 },
    });
  }

  if (lancamentos.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 24,
      head: [['Movimentação do caixa', 'Data', 'Categoria', 'Valor']],
      body: lancamentos.map((l) => [
        l.descricao,
        dataBR(l.data),
        l.categoria || '—',
        (l.tipo === 'entrada' ? '+ ' : '− ') + brl(l.valor_centavos),
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [60, 70, 58], fontSize: 8 },
      margin: { left: 40, right: 40 },
    });
  }

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(8).setTextColor(...CINZA);
    doc.text(
      `${escolinha.nome} · ${mes} · gerado em ${new Date().toLocaleDateString('pt-BR')}`,
      40,
      doc.internal.pageSize.getHeight() - 24
    );
    doc.text(`${p}/${paginas}`, largura - 40, doc.internal.pageSize.getHeight() - 24, { align: 'right' });
  }

  doc.save(`relatorio-${slug(escolinha.nome)}-${competencia.slice(0, 7)}.pdf`);
}

function rotuloCobranca(a) {
  if (a.mensalidade_status === 'paga') return 'Em dia';
  if (a.mensalidade_status === 'isenta') return 'Isento';
  if (a.dias_atraso > 0) return `Atrasada (${a.dias_atraso}d)`;
  if (a.mensalidade_status === 'aberta') return 'Em aberto';
  return '—';
}

/* Recibo de uma mensalidade paga, para o responsável guardar. */
export function reciboPDF({ escolinha, aluno, mensalidade }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a5', orientation: 'landscape' });
  const largura = doc.internal.pageSize.getWidth();

  doc.setFillColor(...VERDE);
  doc.rect(0, 0, largura, 70, 'F');
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(15);
  doc.text(escolinha.nome, 34, 32);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.text('Recibo de mensalidade', 34, 50);
  if (escolinha.cidade) doc.text(escolinha.cidade, largura - 34, 50, { align: 'right' });

  doc.setTextColor(20).setFont('helvetica', 'bold').setFontSize(26);
  doc.text(brl(mensalidade.valor_centavos), 34, 118);

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...CINZA);
  doc.text('Referente a', 34, 148);
  doc.text('Atleta', 34, 178);
  doc.text('Responsável', 34, 208);
  doc.text('Pago em', 34, 238);

  doc.setTextColor(20).setFont('helvetica', 'bold');
  doc.text(mesExtenso(mensalidade.competencia), 130, 148);
  doc.text(aluno.nome + (aluno.turma_nome ? ` · ${aluno.turma_nome}` : ''), 130, 178);
  doc.text(aluno.responsavel_nome || '—', 130, 208);
  doc.text(
    `${dataBR(mensalidade.pago_em)}${mensalidade.metodo ? ` · ${mensalidade.metodo}` : ''}`,
    130,
    238
  );

  doc.setDrawColor(217, 223, 208).line(34, 262, largura - 34, 262);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...CINZA);
  doc.text(
    `Emitido em ${new Date().toLocaleDateString('pt-BR')} · documento gerado pelo sistema da escolinha`,
    34,
    280
  );

  doc.save(`recibo-${slug(aluno.nome)}-${mensalidade.competencia.slice(0, 7)}.pdf`);
}
