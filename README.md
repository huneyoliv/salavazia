# Sala Vazia - SIGAA UFS Classroom Mapper & Explorer

Ferramenta modular de engenharia reversa, varredura concorrente e catalogação dos espaços físicos e horários de aulas do SIGAA da Universidade Federal de Sergipe (UFS).

---

## 🔍 Contexto e Funcionamento do SIGAA

O SIGAA/UFS disponibiliza a visualização pública de horários por espaço físico através do endpoint:

```text
https://www.sigaa.ufs.br/sigaa/public/espaco_fisico/impressao_salas/{ID_DA_SALA}
```

### Mecânica de Requisição e Sessão (JSF)
1. **Entrada e Redirecionamento 302:** Ao receber uma requisição para a rota amigável `/impressao_salas/{ID}`, o backend JSF armazena o espaço físico correspondente na sessão HTTP do usuário (`JSESSIONID`) e responde com `302 Moved Temporarily` para `/impressao_salas.jsf`.
2. **Isolamento de Sessão:** Como o estado da sala ativa fica atrelado ao `JSESSIONID` no servidor, requisições concorrentes entre threads devem utilizar sessões HTTP isoladas (`threading.local`) para evitar condições de corrida (*race conditions*).
3. **Injeção de Horários na Grade:** Os horários não vêm fixos no HTML da tabela; eles são injetados dinamicamente via blocos JavaScript no final da página:
   ```javascript
   var elem = document.getElementById('{ID_SALA}_{DIA}_{TURNO}_{HORARIO}');
   if (elem){
       if(elem.innerHTML=='') elem.innerHTML = elem.innerHTML + '{CODIGO_TURMA}';
       else elem.innerHTML = elem.innerHTML + '<br>{CODIGO_TURMA}';
   }
   ```
4. **Matriz de Coordenadas (`ID_D_T_H`):**
   * **D (Dia):** `1` = Domingo, `2` = Segunda, ..., `7` = Sábado.
   * **T (Turno):** `1` = Manhã, `2` = Tarde, `3` = Noite.
   * **H (Horário/Faixa):** Índice de 1 a 6 de acordo com a faixa horária.

---

## 🚀 Instalação e Ambiente

Requisitos: **Python 3.10+**

```bash
# Criar e ativar ambiente virtual
python -m venv .venv
.venv\Scripts\activate  # No Linux/macOS: source .venv/bin/activate

# Instalar dependências em modo editável com ferramentas de desenvolvimento
pip install -e ".[dev]"
```

---

## 🛠️ Uso da Linha de Comando (CLI)

O pacote instala o comando `salavazia` no ambiente:

### 1. Varredura Concorrente por Faixa de IDs (`scan`)
Varre uma sequência de IDs no SIGAA, catalogando os espaços encontrados e exportando os resultados automaticamente para JSON e CSV:

```bash
salavazia scan --start 1008480 --end 1008750 --workers 8 --output-dir data
```

### 2. Consulta a Salas Específicas (`probe`)
Inspeciona em tempo real um ou mais IDs de salas:

```bash
salavazia probe --ids 1008644 1008500 1008600
```

### 3. Resumo Estatístico do Catálogo (`summary`)
Exibe o quantitativo de salas por prédio, categoria e ocupação ativa a partir de um arquivo JSON:

```bash
salavazia summary --file data/rooms.json
```

---

## 📊 Estrutura dos Dados Catalogados

Os dados são salvos em `data/rooms.json` (detalhado com turmas e matriz horária) e `data/rooms.csv` (tabular):

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | `int` | Chave primária do espaço físico no SIGAA |
| `name` | `str` | Título completo (ex: `SALA DE AULA - DID 6 - 106`) |
| `building` | `str` | Prédio ou Didática normalizada (`DID 1` a `DID 6`, `DFI`, `DEC`, etc.) |
| `room_number` | `str` | Identificador da sala (ex: `106`, `004`, `101`) |
| `category` | `str` | `SALA DE AULA`, `LABORATORIO`, `AUDITORIO`, `PROJECAO`, etc. |
| `capacity` | `int` | Capacidade máxima de alunos |
| `available_capacity_pct` | `int` | Capacidade disponível informada pelo SIGAA |
| `academic_period` | `str` | Período acadêmico de vigência (ex: `2026/2`) |
| `has_schedule` | `bool` | Indica se possui horários e turmas ativas |
| `status` | `str` | `active` ou `no_schedule` |
| `courses` | `list` | Lista de turmas com código e nome da disciplina |
| `allocations` | `list` | Lista de alocações na matriz (`dia`, `turno`, `faixa`, `turma`) |

---

## 🧪 Testes e Qualidade de Código

O projeto conta com suíte de testes unitários e validações automatizadas:

```bash
# Executar testes unitários
pytest -v

# Validação de linter
ruff check .

# Checagem estática de tipos
mypy salavazia tests

# Auditoria de segurança de dependências
pip-audit
```

---

## 🌐 Web App & PWA (GitHub Pages)

O projeto inclui uma aplicação web moderna e responsiva (PWA) hospedada no **GitHub Pages**:

🔗 **Acesse online:** [https://huneyoliv.github.io/salavazia/](https://huneyoliv.github.io/salavazia/)

### Funcionalidades do Web App
- 📍 **Localização por GPS (Haversine):** Identifica em tempo real qual prédio o aluno está mais próximo e ordena as salas livres da mais perto para a mais longe.
- 🕒 **Relógio e Grade ao Vivo:** Identifica a faixa horária oficial da UFS (Resolução CONEPE 2024.1) minuto a minuto.
- 🟢 **Projeção de Ocupação:** Informa até que horas cada sala permanecerá livre (`Livre até 15:10`) ou quando será desocupada (`Libera às 16:10`).
- 🏛️ **Filtros por Campus e Prédio:** Suporte a São Cristóvão (Didáticas 1-7, Departamentos, CCBS, Multidepartamental), Itabaiana (Blocos B, C, D) e Aracaju (CULTART).
- 📱 **PWA Offline:** Funciona sem conexão à internet utilizando cache do Service Worker.

### Automação com GitHub Actions
- **`scrape.yml`:** Executa 3 vezes ao dia (06:45, 12:45 e 18:30 BRT) nas transições de turno letivo, atualizando o arquivo `data/status.json` automaticamente.
- **`deploy.yml`:** Publica automaticamente qualquer alteração no frontend ou dados diretamente no GitHub Pages.

