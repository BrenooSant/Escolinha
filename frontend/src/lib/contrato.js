/* Campos que o banco preenche no contrato (render_contrato). A lista
   aparece em Ajustes para o gestor saber o que pode usar. */
export const CAMPOS_CONTRATO = [
  ['{{escolinha}}', 'razão social (ou nome) da escolinha'],
  ['{{documento_escolinha}}', 'CNPJ ou CPF da escolinha'],
  ['{{cidade}}', 'cidade da escolinha'],
  ['{{responsavel}}', 'nome de quem aceita'],
  ['{{cpf_responsavel}}', 'CPF de quem aceita'],
  ['{{aluno}}', 'nome do atleta'],
  ['{{nascimento}}', 'nascimento do atleta'],
  ['{{turma}}', 'turma'],
  ['{{mensalidade}}', 'valor da mensalidade'],
  ['{{vencimento}}', 'dia do vencimento'],
  ['{{taxa_matricula}}', 'taxa de matrícula'],
  ['{{multa}}', 'multa por atraso'],
  ['{{juros}}', 'juros por atraso'],
  ['{{data}}', 'data do aceite'],
];

/* Ponto de partida, não parecer jurídico: o gestor deve revisar com
   quem o assessora antes de ligar o aceite. */
export const MODELO_PADRAO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS — ESCOLINHA DE FUTEBOL

CONTRATADA: {{escolinha}}, inscrita sob o nº {{documento_escolinha}}, com sede em {{cidade}}.
CONTRATANTE: {{responsavel}}, CPF {{cpf_responsavel}}, responsável legal pelo(a) atleta {{aluno}}, nascido(a) em {{nascimento}}.

1. OBJETO. A CONTRATADA oferece aulas de futebol ao atleta na turma {{turma}}, conforme a grade de horários divulgada pela escolinha.

2. VALORES. O CONTRATANTE pagará mensalidade de {{mensalidade}}, com vencimento todo dia {{vencimento}}. Taxa de matrícula: {{taxa_matricula}}. Em caso de atraso, incidem multa de {{multa}} e juros de {{juros}}, proporcionais aos dias.

3. FALTAS. Faltas do atleta não geram desconto nem reposição obrigatória. Treinos cancelados pela escolinha serão repostos ou avisados com antecedência.

4. SAÚDE. O CONTRATANTE declara que o atleta está apto à prática esportiva e se compromete a informar condição de saúde, alergia ou uso de medicação.

5. USO DE IMAGEM. Vale a autorização informada na ficha de matrícula, que pode ser revogada a qualquer tempo, por escrito.

6. CANCELAMENTO. Qualquer das partes pode encerrar este contrato com aviso de 30 dias. Mensalidades vencidas continuam devidas.

7. DADOS PESSOAIS. Os dados informados são usados só para a gestão da matrícula, da frequência e das cobranças, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).

Aceito eletronicamente em {{data}}.`;
