// script.js
feather.replace();

// Store the fetched data globally for filtering
let cadastrosData = [];
let runningIPs = [];

const statusConfig = {
  'connecting': { color: 'yellow', icon: 'loader', title: 'Conectando...' },
  'started': { color: 'green', icon: 'square', title: 'Stop' },
  'running': { color: 'green', icon: 'square', title: 'Stop' },
  'reconnecting': { color: 'orange', icon: 'loader', title: 'Reconectando...' },
  'error': { color: 'red', icon: 'alert-circle', title: 'Erro' },
  'stopped': { color: 'red', icon: 'play', title: 'Play' },
  // Adicione outros estados conforme necessário
};

// Function to toggle the sidebar (remains unchanged)
const sidebarToggle = () => {
  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('content');
  sidebar.classList.toggle('active');
  content.classList.toggle('active');
};

// Event listener for the sidebar toggle button (remains unchanged)
document.getElementById('sidebarCollapse').addEventListener('click', sidebarToggle);

// Função para carregar Cadastros
const loadCadastros = () => {
  const mainContent = document.getElementById('main-content');
  document.getElementById('page-title').innerText = 'Cadastros';

  // Limpar o conteúdo anterior
  mainContent.innerHTML = '';

  // Buscar dados de cadastros para construir o mapa de grupos e unidades
  fetch('/plates') // Certifique-se de que este endpoint retorna os dados necessários
    .then(response => {
      if (!response.ok) {
        throw new Error('Erro ao buscar dados de cadastros.');
      }
      return response.json();
    })
    .then(data => {
      cadastrosData = data; // Armazenar dados globalmente

      // **Adicionar Ordenação Aqui**
      cadastrosData.sort((a, b) => {
        // Comparar os grupos alfabeticamente
        const grupoA = a.grupo.toLowerCase();
        const grupoB = b.grupo.toLowerCase();

        if (grupoA < grupoB) return -1;
        if (grupoA > grupoB) return 1;

        // Se os Grupos forem iguais, comparar Unidades numericamente
        const unidadeA = parseInt(a.unid, 10);
        const unidadeB = parseInt(b.unid, 10);

        // Tratar possíveis valores NaN
        if (isNaN(unidadeA) && isNaN(unidadeB)) return 0;
        if (isNaN(unidadeA)) return 1;
        if (isNaN(unidadeB)) return -1;

        return unidadeA - unidadeB;
      });

      // Criar um mapeamento de 'Grupo' para suas 'Unidades'
      const grupoUnidadeMap = {};
      cadastrosData.forEach(user => {
        const grupo = user.grupo;
        const unid = user.unid;

        if (!grupoUnidadeMap[grupo]) {
          grupoUnidadeMap[grupo] = new Set();
        }
        grupoUnidadeMap[grupo].add(unid);
      });

      // Extrair valores únicos de 'Grupo'
      const grupos = Object.keys(grupoUnidadeMap).sort();

      // Armazenar o grupoUnidadeMap para uso posterior
      window.grupoUnidadeMapCadastros = grupoUnidadeMap;

      // Criar filtros com uma única linha e adicionar o filtro por Placa
      const filtersHTML = `
        <div class="filter-container">
          <div class="filter-row">
            <input type="text" id="filter-nome-cadastros" placeholder="Filtrar por Nome">
            <select id="filter-grupo-cadastros">
              <option value="">Selecione um Grupo</option>
              ${grupos.map(grupo => `<option value="${grupo}">${grupo}</option>`).join('')}
            </select>
            <select id="filter-unidade-cadastros" disabled>
              <option value="">Selecione uma Unidade</option>
            </select>
            <input type="text" id="filter-placa-cadastros" placeholder="Filtrar por Placa">
          </div>
          <div class="filter-row">
            <button id="filter-clear-cadastros">Limpar Filtros</button>
          </div>
        </div>
      `;

      // Criar a tabela de cadastros
      const tableHTML = `
        <table id="cadastros-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Grupo</th>
              <th>Unidade</th>
              <th>Placas</th>
              <th></th> <!-- Botão de expansão -->
            </tr>
          </thead>
          <tbody>
            <!-- Cadastros serão inseridos aqui -->
          </tbody>
        </table>
      `;

      // Adicionar filtros e tabela ao conteúdo principal
      mainContent.innerHTML = filtersHTML + tableHTML;

      // Adicionar event listeners aos filtros
      document.getElementById('filter-grupo-cadastros').addEventListener('change', handleGrupoChangeCadastros);
      document.getElementById('filter-unidade-cadastros').addEventListener('change', applyCadastrosFilters);
      document.getElementById('filter-nome-cadastros').addEventListener('input', applyCadastrosFilters);
      document.getElementById('filter-placa-cadastros').addEventListener('input', applyCadastrosFilters);
      document.getElementById('filter-clear-cadastros').addEventListener('click', clearCadastrosFilters);

      // Aplicar filtros iniciais (carregar todos os cadastros)
      applyCadastrosFilters();
    })
    .catch(error => {
      console.error(error);
      mainContent.innerHTML = `<p>Erro ao carregar cadastros. Tente novamente mais tarde.</p>`;
    });
};

const handleGrupoChangeCadastros = () => {
  const grupoSelect = document.getElementById('filter-grupo-cadastros');
  const unidadeSelect = document.getElementById('filter-unidade-cadastros');
  const selectedGrupo = grupoSelect.value;

  // Limpar as opções do select de Unidade
  unidadeSelect.innerHTML = '';

  if (selectedGrupo === '') {
    // Nenhum grupo selecionado, desabilitar o select de Unidade
    unidadeSelect.disabled = true;
    unidadeSelect.innerHTML = '<option value="">Selecione uma Unidade</option>';
  } else {
    // Grupo selecionado, habilitar o select de Unidade e popular opções
    unidadeSelect.disabled = false;

    const unidades = Array.from(window.grupoUnidadeMapCadastros[selectedGrupo]).sort();

    unidadeSelect.innerHTML = `
      <option value="">Todas as Unidades</option>
      ${unidades.map(unid => `<option value="${unid}">${unid}</option>`).join('')}
    `;
  }

  // Aplicar filtros ao mudar o Grupo
  applyCadastrosFilters();
};

// Função para aplicar os filtros na página de Cadastros
const applyCadastrosFilters = () => {
  const nome = document.getElementById('filter-nome-cadastros').value.trim().toLowerCase();
  const grupo = document.getElementById('filter-grupo-cadastros').value;
  const unidade = document.getElementById('filter-unidade-cadastros').value;
  const placa = document.getElementById('filter-placa-cadastros').value.trim().toLowerCase();

  // Filtrar os cadastrosData com base nos filtros
  const filteredData = cadastrosData.filter(user => {
    const nomeMatch = user.userName.toLowerCase().includes(nome);
    const grupoMatch = grupo === '' || user.grupo === grupo;
    const unidadeMatch = unidade === '' || user.unid === unidade;
    const placaMatch = placa === '' || user.devices.some(device => device.plate.toLowerCase().includes(placa));

    return nomeMatch && grupoMatch && unidadeMatch && placaMatch;
  });

  // Renderizar a tabela com os dados filtrados
  renderCadastrosTable(filteredData);
};

// Função para limpar os filtros e recarregar todos os cadastros
const clearCadastrosFilters = () => {
  document.getElementById('filter-nome-cadastros').value = '';
  document.getElementById('filter-grupo-cadastros').value = '';
  document.getElementById('filter-unidade-cadastros').innerHTML = '<option value="">Selecione uma Unidade</option>';
  document.getElementById('filter-unidade-cadastros').disabled = true;
  document.getElementById('filter-placa-cadastros').value = '';

  // Recarregar todos os cadastros
  applyCadastrosFilters();
};

// Função para renderizar os cadastros na tabela com apenas Nome, Grupo, Unidade e Placas
const renderCadastrosTable = (data) => {
  const tbody = document.querySelector('#cadastros-table tbody');
  tbody.innerHTML = ''; // Limpar tabela antes de renderizar

  data.forEach((user) => {
    // Obter o índice original do usuário na cadastrosData
    const originalIndex = cadastrosData.indexOf(user);

    // Extrair placas dos dispositivos (apenas os números das placas, separadas por '/')
    const placas = user.devices && user.devices.length > 0
      ? user.devices.map(device => device.plate).join(' / ')
      : 'Nenhuma';

      const rowHTML = `
      <tr data-index="${originalIndex}">
        <td>${user.userName}</td>
        <td>${user.grupo}</td>
        <td>${user.unid}</td>
        <td>${placas}</td>
        <td class="expand-button-cell">
          <button class="expand-button">
            <i data-feather="plus-circle"></i>
          </button>
        </td>
      </tr>
    `;

    tbody.insertAdjacentHTML('beforeend', rowHTML);
  });

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhum cadastro encontrado.</td></tr>';
  }

  // Adicionar event listeners aos botões de expansão
  const expandButtons = document.querySelectorAll('.expand-button');
  expandButtons.forEach(button => {
    button.addEventListener('click', handleExpandClick);
  });

  // **Chamar feather.replace() para renderizar os ícones adicionados**
  feather.replace();

};

// Função para lidar com o botão de expansão
const handleExpandClick = (event) => {
  const button = event.target.closest('button.expand-button');
  const row = button.closest('tr');
  const index = row.getAttribute('data-index');
  const user = cadastrosData[index];

  // Verificar se a linha já está expandida
  if (row.classList.contains('expanded')) {
    // Collapsar a linha
    row.classList.remove('expanded');
    // Alterar ícone para plus-circle
    button.innerHTML = '<i data-feather="plus-circle"></i>';

    // Remover a linha expandida
    const expandedRow = row.nextElementSibling;
    if (expandedRow && expandedRow.classList.contains('expanded-row')) {
      expandedRow.remove();
    }
  } else {
    // Expandir a linha
    row.classList.add('expanded');
    // Alterar ícone para minus-circle
    button.innerHTML = '<i data-feather="minus-circle"></i>';

    // Criar a linha expandida com detalhes dos veículos
    let expandedRowHTML = `
      <tr class="expanded-row">
        <td colspan="5">
          <table class="inner-table">
            <thead>
              <tr>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Cor</th>
                <th>Placa</th>
              </tr>
            </thead>
            <tbody>
    `;

    user.devices.forEach(device => {
      expandedRowHTML += `
        <tr>
          <td>${device.make || 'N/A'}</td>
          <td>${device.model || 'N/A'}</td>
          <td>${device.color || 'N/A'}</td>
          <td>${device.plate || 'N/A'}</td>
        </tr>
      `;
    });

    expandedRowHTML += `
            </tbody>
          </table>
        </td>
      </tr>
    `;

    // Inserir a linha expandida após a linha atual
    row.insertAdjacentHTML('afterend', expandedRowHTML);
  }

  // Atualizar os ícones do Feather após inserir/remover elementos
  feather.replace();
};

// Connect to the Socket.IO server
const socket = io();

// Keep track of the current snack message and its timeout
let currentSnack = null;
let snackTimeout = null;

// Function to display snack messages
const showSnackMessage = (message, type = 'info') => {
  // If there's a current snack message, remove it with fade-out
  if (currentSnack) {
    // Add fade-out class for animation
    currentSnack.classList.add('fade-out');
    // Remove the element after the fade-out transition
    setTimeout(() => {
      currentSnack.remove();
    }, 500); // Duration matches the CSS transition
    currentSnack = null;
  }
  // If there's an existing timeout, clear it
  if (snackTimeout) {
    clearTimeout(snackTimeout);
    snackTimeout = null;
  }

  // Create a div element for the snack message
  const snack = document.createElement('div');
  snack.className = `snack-message ${type}`;
  snack.textContent = message;

  // Append to the body
  document.body.appendChild(snack);

  // Store the current snack and timeout
  currentSnack = snack;
  snackTimeout = setTimeout(() => {
    // Add fade-out class for animation
    snack.classList.add('fade-out');
    // Remove the element after the fade-out transition
    setTimeout(() => {
      snack.remove();
      currentSnack = null;
      snackTimeout = null;
    }, 500); // Duration matches the CSS transition
  }, 3000);
};

// Function to load Configurações
const loadConfiguracoes = () => {
  const mainContent = document.getElementById('main-content');
  document.getElementById('page-title').innerText = 'Configurações';

  // Limpar o conteúdo anterior
  mainContent.innerHTML = '';

  // Fetch data from the backend
  Promise.all([
    fetch('/settings').then(response => response.json()),
    fetch('/process-status').then(response => response.json()),
    fetch('/mg3000-config').then(response => response.json()), 
    fetch('/performance-data').then(response => response.json()) 
  ])
    .then(([data, processStatusResponse, mg3000Data, performanceData]) => {
      const processes = processStatusResponse.processes || [];

      // Criar um mapeamento de IP para estado
      const ipStatusMap = {};
      processes.forEach(process => {
        ipStatusMap[process.ip] = process.status.state;
      });

      // HTML para a primeira tabela (configurações de câmeras)
      let tableHTML = `
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Canal</th>
                <th>Endereço IP</th>
                <th>Device</th>
                <th>Frames</th>
                <th>FPS</th>
                <th>CPU</th>
                <th>GPU</th>
                <th>Status</th>
                <th>Ações</th> 
              </tr>
            </thead>
            <tbody>
      `;

      data.forEach((camera, index) => {
        const ip = camera.equipAdd;
        const cameraState = ipStatusMap[ip] || 'stopped'; // Estado padrão 'stopped'
        const config = statusConfig[cameraState] || statusConfig['stopped'];

        // Criar opções para o select de dispositivo (apenas 'cpu' e 'gpu')
        const deviceOptions = `
          <option value="cpu" ${camera.device === 'cpu' ? 'selected' : ''}>CPU</option>
          <option value="gpu" ${camera.device === 'gpu' ? 'selected' : ''}>GPU</option>
        `;
      
        // Create options for skipFrames (1 to 15)
        const skipFramesOptions = Array.from({ length: 15 }, (_, i) => i + 1)
          .map(value => `<option value="${value}" ${camera.skipFrames == value ? 'selected' : ''}>${value}</option>`)
          .join('');
        
        tableHTML += `
          <tr>
            <td>${mapChannelOccupied(camera.channelOccupied)}</td>
            <td>${ip || ''}</td>
                       <td>
              <select class="device-select" data-ip="${ip}">
                ${deviceOptions}
              </select>
            </td>
            <td>
              <select class="skip-frames-select" data-ip="${ip}">
                ${skipFramesOptions}
              </select>
            </td>
            <td class="fps-cell"></td>
            <td class="performance-cpu-cell"></td>
            <td class="performance-gpu-cell"></td>
            <td><span class="status-circle ${config.color}"></span></td>
            <td>
              <button class="play-button" data-index="${index}" data-status="${cameraState}" title="${config.title}">
                <i data-feather="${config.icon}"></i>
              </button>
            </td>
          </tr>
        `;
      });

      tableHTML += `
            </tbody>
          </table>
        </div>
      `;

      // HTML para a segunda tabela (configurações do MG3000)
      let secondTableHTML = `
        <div class="table-container">
          <form id="mg3000-form">
            <table>
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Endereço do MG3000</th>
                  <th>Endereço da Receptora</th>
                  <th>Endereço da Porta</th>
                </tr>
              </thead>
              <tbody>
      `;

      // Criar um objeto para acesso fácil às configurações por canal
      const mg3000ConfigByChannel = {};
      mg3000Data.forEach(config => {
        mg3000ConfigByChannel[config.channel] = config;
      });

      // Gerar as linhas da tabela com os campos preenchidos
      for (let channel = 1; channel <= 4; channel++) {
        const config = mg3000ConfigByChannel[channel] || {};
        secondTableHTML += `
          <tr>
            <td>Canal ${channel}</td>
            <td><input type="text" name="mg3000Address_${channel}" placeholder="Endereço do MG3000" value="${config.mg3000Address || ''}"></td>
            <td><input type="text" name="receptorAddress_${channel}" placeholder="Endereço da Receptora" value="${config.receptorAddress || ''}"></td>
            <td><input type="text" name="portAddress_${channel}" placeholder="Endereço da Porta" value="${config.portAddress || ''}"></td>
          </tr>
        `;
      }

      secondTableHTML += `
            </tbody>
          </table>
          <div class="form-actions">
            <button type="submit" class="btn-save">Salvar</button>
          </div>
        </form>
      </div>
      `;

      // Combinar ambas as tabelas
      mainContent.innerHTML = `
        <div class="configuracoes-container">
          <div class="configuracoes-top">
            ${tableHTML}
          </div>
          <div class="configuracoes-bottom">
            ${secondTableHTML}
          </div>
        </div>
      `;

      // Re-renderizar os ícones do Feather
      feather.replace();

      // Adicionar event listeners aos botões de play/stop
      const playButtons = document.querySelectorAll('.play-button');
      playButtons.forEach(button => {
        button.addEventListener('click', handlePlayButtonClick);
      });

      // Adicionar event listener para submissão do formulário MG3000
      document.getElementById('mg3000-form').addEventListener('submit', handleMG3000FormSubmit);
    })
    .catch(error => {
      console.error(error);
      mainContent.innerHTML = `<p>Erro ao carregar configurações. Tente novamente mais tarde.</p>`;
    });
};

// Função auxiliar para mapear channelOccupied para número
const mapChannelOccupied = (channelOccupied) => {
  const channelMap = {
    'chan1': '1',
    'chan2': '2',
    'chan3': '3',
    'chan4': '4'
  };
  return channelMap[channelOccupied] || 'N/A';
};

// Function to handle MG3000 form submission
const handleMG3000FormSubmit = (event) => {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);

  // Prepare the data to send to the backend
  const dataToSend = [];

  for (let channel = 1; channel <= 4; channel++) {
    const mg3000Address = formData.get(`mg3000Address_${channel}`);
    const receptorAddress = formData.get(`receptorAddress_${channel}`);
    const portAddress = formData.get(`portAddress_${channel}`);
    const skipFrames = parseInt(formData.get(`skipFrames_${channel}`), 10) || 1;

    dataToSend.push({
      channel,
      mg3000Address,
      receptorAddress,
      portAddress,
      skipFrames,
    });
  }

  // Send data to the backend (you need to implement the backend endpoint)
  fetch('/save-mg3000-config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(dataToSend)
  })
    .then(response => {
      if (!response.ok) {
        throw new Error('Erro ao salvar configurações do MG3000.');
      }
      return response.json();
    })
    .then(result => {
      console.log(result.message);
      showSnackMessage('Configurações salvas com sucesso!', 'success');
    })
    .catch(error => {
      console.error(error);
      showSnackMessage('Não foi possível salvar as configurações.', 'error');
    });
};

// Function to handle Play/Stop button click
const handlePlayButtonClick = (event) => {
  const button = event.currentTarget;
  const row = button.closest('tr'); // Encontrar a linha pai do botão
  const index = button.getAttribute('data-index');
  const status = button.getAttribute('data-status');

  // Encontrar o dropdown de Device na mesma linha
  const deviceSelect = row.querySelector('.device-select');
  const selectedDevice = deviceSelect ? deviceSelect.value : 'cpu';

  const skipFrames = row.querySelector('.skip-frames-select');
  const frameRate = skipFrames ? skipFrames.value : '3';
  
  // Verificar se o botão está em um estado intermediário
  if (status === 'starting' || status === 'reconnecting') {
    // Ignorar cliques durante estados intermediários
    return;
  }

  // Alterar o botão para o estado de carregamento
  button.setAttribute('data-status', 'starting');
  button.setAttribute('title', 'Iniciando...');
  button.innerHTML = '<i data-feather="loader"></i>';
  feather.replace();

  // Adicionar a notificação de "Iniciando o Serviço"
  showSnackMessage('Iniciando o serviço, por favor aguarde...', 'info');

  let camera;

  fetch('/settings')
    .then(response => response.json())
    .then(data => {
      camera = data[index];

      if (!camera) {
        throw new Error('Câmera não encontrada.');
      }

      // Encontrar o IP da câmera correspondente
      const ip = camera.equipAdd;

      // Atualizar o círculo de status para 'starting' (amarelo)
      updateStatusCircle(ip, 'starting');

      // Desabilitar o botão para prevenir múltiplos cliques
      button.disabled = true;

      console.log('Device: ', selectedDevice, 'Frame Rate: ', frameRate)

      // Iniciar ou parar o reconhecimento com base no status atual
      if (status === 'stopped' || status === 'error') {
        // Iniciar o processo de reconhecimento
        fetch('/start-recognition', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ip: camera.equipAdd,
            user: camera.equipUser,
            password: camera.equipPass,
            device: selectedDevice,
            frameRate: frameRate
          })
        })
        .then(response => {
          if (!response.ok) {
            throw new Error('Erro ao iniciar o reconhecimento.');
          }
          return response.json();
        })
        .then(result => {
          console.log(result.message);
          // Aguardaremos o evento 'process-started' para atualizar a UI
        })
        .catch(error => {
          console.error(error);
          showSnackMessage('Não foi possível iniciar o reconhecimento.', 'error');
          // // Resetar o botão de volta para Play
          // const config = statusConfig['stopped'];
          // button.setAttribute('data-status', 'stopped');
          // button.setAttribute('title', config.title);
          // button.innerHTML = `<i data-feather="${config.icon}"></i>`;
          // feather.replace();
          // button.disabled = false;
          
          // // Atualizar o círculo de status para vermelho
          // updateStatusCircle(ip, 'stopped');
        });
      } else if (status === 'running') {
        // Parar o processo de reconhecimento
        fetch('/stop-recognition', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ip: camera.equipAdd
          })
        })
        .then(response => {
          if (!response.ok) {
            throw new Error('Erro ao parar o reconhecimento.');
          }
          return response.json();
        })
        .then(result => {
          console.log(result.message);
          // Aguardaremos o evento 'process-stopped' para atualizar a UI
        })
        .catch(error => {
          console.error(error);
          showSnackMessage('Não foi possível parar o reconhecimento.', 'error');
          // // Resetar o botão de volta para Stop
          // const config = statusConfig['running'];
          // button.setAttribute('data-status', 'running');
          // button.setAttribute('title', config.title);
          // button.innerHTML = `<i data-feather="${config.icon}"></i>`;
          // feather.replace();
          // button.disabled = false;
          
          // // Atualizar o círculo de status para vermelho (já está parado)
          // updateStatusCircle(ip, 'stopped');
        });
      }
    })
    .catch(error => {
      console.error('Erro ao buscar configurações:', error);
      showSnackMessage('Erro ao buscar configurações.', 'error');
      // // Resetar o botão de volta para Play
      // const config = statusConfig['stopped'];
      // button.setAttribute('data-status', 'stopped');
      // button.setAttribute('title', config.title);
      // button.innerHTML = `<i data-feather="${config.icon}"></i>`;
      // feather.replace();
      // button.disabled = false;
    });
};

// Helper function to update the status circle by IP address
const updateStatusCircle = (ip, status) => {
  console.log(`Atualizando status para IP: ${ip} com status: ${status}`);
  
  const rows = document.querySelectorAll('#main-content table tbody tr');
  for (const row of rows) {
    const ipCell = row.cells[1]; 
    if (ipCell && ipCell.textContent.trim() === ip) {
      const statusCell = row.cells[7];
      const statusCircle = statusCell.querySelector('.status-circle');
      if (statusCircle) {
        console.log(`Encontrado status-circle para IP: ${ip}`);
        // Remover classes de cor anteriores
        statusCircle.classList.remove('green', 'red', 'yellow', 'orange');

        // Adicionar nova classe de cor baseada no status
        switch (status) {
          case 'running':
            statusCircle.classList.add('green');
            break;
          case 'starting':
            statusCircle.classList.add('yellow');
            break;
          case 'reconnecting':
            statusCircle.classList.add('orange');
            break;
          case 'error':
          case 'stopped':
          default:
            statusCircle.classList.add('red');
            break;
        }
      } else {
        console.warn(`status-circle não encontrado para IP: ${ip}`);
      }
      break;
    }
  }
};

const updateStatusMarquee = (status) => {
  const statusMarquee = document.getElementById('status-marquee');
  statusMarquee.textContent = status; // Atualiza o texto do letreiro baseado no status recebido
};

// Função para atualizar a tabela de controle com novos eventos
const updateControleTable = (data) => {
  const { channelNumber, customerInfo, timestamp } = data;
  const tbody = document.getElementById(`table-body-${channelNumber}`);

  if (!tbody) {
    console.error(`Tabela para o canal ${channelNumber} não encontrada.`);
    return;
  }

  // Criar nova linha para o acesso atual
  const newRow = document.createElement('tr');
  newRow.classList.add('current-access'); // Classe para estilização

  // Gerar o SVG da placa
  const plateSVG = generatePlateSVG(customerInfo.plate);

  // Criar uma célula com o SVG da placa
  const plateCellContent = `
    <div class="plate-svg-container">
      ${plateSVG}
    </div>
  `;

  newRow.innerHTML = `
    <td>${customerInfo.name || 'Desconhecido'}</td>
    <td>${customerInfo.group || ''}</td>
    <td>${customerInfo.unit || ''}</td>
    <td>${customerInfo.make || ''}</td>
    <td>${customerInfo.model || ''}</td>
    <td>${customerInfo.color || ''}</td>
    <td>${plateCellContent}</td>
    <td>${formatTimestamp(timestamp)}</td>
  `;

  // Remover a classe 'current-access' da linha anterior, se existir
  const previousCurrent = tbody.querySelector('.current-access');
  if (previousCurrent) {
    previousCurrent.classList.remove('current-access');
    previousCurrent.style.color = ''; // Resetar a cor
    previousCurrent.style.fontWeight = ''; // Resetar o peso da fonte
  }

  // Inserir a nova linha no início do tbody
  tbody.insertBefore(newRow, tbody.firstChild);

  // Aplicar estilos à nova linha
  newRow.style.color = 'green';
  newRow.style.fontWeight = 'bold';

  // Remover linhas excedentes se houver mais de 20
  const rows = tbody.querySelectorAll('tr');
  if (rows.length > 20) {
    tbody.removeChild(tbody.lastChild);
  }
};

const setupControleSocket = () => {
  console.log('Setup Socket')
  // Remover event listeners anteriores para evitar múltiplas ligações
  socket.off('plate-found');
  socket.off('process-started');
  socket.off('process-stopped');
  socket.off('process-error');
  socket.off('process-starting');
  socket.off('process-reconnecting');

  // Escutar o evento 'plate-found' para atualizações
  socket.on('plate-found', (data) => {
    console.log(data);
    updateControleTable(data);
  });

  // Escutar o evento 'process-starting'
  socket.on('process-starting', ({ ip }) => {
    console.log('process-starting');
    const statusMarquee = document.getElementById('status-marquee');

    if(statusMarquee){
      statusMarquee.textContent = `Conectando...`;
      statusMarquee.style.color = 'black'; // Letras em preto
      statusMarquee.style.backgroundColor = 'yellow'; // Cor para 'starting'
    }
    
    // Atualizar o status da tabela
    updateStatusCircle(ip, 'starting');

    // Mostrar mensagem de snack
    showSnackMessage(`Processo em inicialização para a câmera ${ip}.`, 'info');
  });

  // Escutar o evento 'process-reconnecting'
  socket.on('process-reconnecting', ({ ip }) => {
    console.log('process-reconnecting');
    const statusMarquee = document.getElementById('status-marquee');
    
    if(statusMarquee){
      statusMarquee.textContent = `Reconectando...`;
      statusMarquee.style.color = 'black'; // Letras em preto
      statusMarquee.style.backgroundColor = 'orange'; // Cor para 'reconnecting'   
    }
    
    // Atualizar o status da tabela
    updateStatusCircle(ip, 'reconnecting');

    // Mostrar mensagem de snack
    showSnackMessage(`Reconectando ao processo para a câmera ${ip}.`, 'info');
  });

  // Escutar o evento 'process-started'
  socket.on('process-started', ({ ip }) => {
    console.log('process-started');
    const statusMarquee = document.getElementById('status-marquee');

    if(statusMarquee){
      statusMarquee.textContent = `Processo em execução`;
      statusMarquee.style.color = 'white'; // Letras em branco
      statusMarquee.style.backgroundColor = 'green'; // Cor para 'running'
    }

    // Atualizar o status da tabela
    updateStatusCircle(ip, 'running');

    // Atualizar o botão correspondente
    const button = findButtonByIP(ip);
    if (button) {
      const config = statusConfig['running'];
      button.setAttribute('data-status', 'running');
      button.setAttribute('title', config.title);
      button.innerHTML = `<i data-feather="${config.icon}"></i>`;
      feather.replace();
      button.disabled = false;
      showSnackMessage(`Reconhecimento iniciado para a câmera ${ip}.`, 'info');
    }
  });

  // Escutar o evento 'process-stopped'
  socket.on('process-stopped', ({ ip }) => {
    console.log('process-stopped');
    const statusMarquee = document.getElementById('status-marquee');

    if(statusMarquee){
      statusMarquee.textContent = `Processo parado`;
      statusMarquee.style.color = 'white'; // Letras em branco
      statusMarquee.style.backgroundColor = 'red'; // Cor para 'stopped'
    }

    // Atualizar o status da tabela
    updateStatusCircle(ip, 'stopped');

    // Atualizar o botão correspondente
    const button = findButtonByIP(ip);
    if (button) {
      const config = statusConfig['stopped'];
      button.setAttribute('data-status', 'stopped');
      button.setAttribute('title', config.title);
      button.innerHTML = `<i data-feather="${config.icon}"></i>`;
      feather.replace();
      button.disabled = false;
      showSnackMessage(`Processo parado`, 'info');
    }
  });

  // Escutar o evento 'process-error'
  socket.on('process-error', ({ ip, errorType }) => {
    console.log('process-error');
    
    // Verificar se 'status-marquee' existe antes de atualizar
    const statusMarquee = document.getElementById('status-marquee');

    if (statusMarquee) {
      statusMarquee.textContent = `Erro: ${errorType}`;
      statusMarquee.style.color = 'white'; // Letras em preto
      statusMarquee.style.backgroundColor = 'red'; // Cor para 'error'
    }

    // Atualizar o status da tabela
    updateStatusCircle(ip, 'error');

    // Atualizar o botão correspondente
    const button = findButtonByIP(ip);
    if (button) {
      const config = statusConfig['error'];
      button.setAttribute('data-status', 'error');
      button.setAttribute('title', config.title);
      button.innerHTML = `<i data-feather="${config.icon}"></i>`;
      feather.replace();
      button.disabled = false;
      showSnackMessage(`Erro no processo para a câmera ${ip}: ${errorType}.`, 'error');
    }
  });
};

// Função para gerar o SVG da placa
const generatePlateSVG = (plateNumber) => {
  // Caminho para o template da placa
  const templatePath = '/assets/plates/plate_template.svg';

  // Obter os caracteres individuais da placa
  const characters = plateNumber.toUpperCase().split('');

  // Dimensões e posições iniciais
  const plateWidth = 210; // Largura do template da placa
  const plateHeight = 43; // Altura do template da placa

  // Definir dimensões dos caracteres
  const charWidth = 14; // Largura dos caracteres
  const charHeight = 21; // Altura dos caracteres

  // Espaçamento entre os caracteres
  const charSpacing = 1.5; // Espaço entre os caracteres

  // Número total de caracteres na placa
  const totalChars = characters.length;

  // Calcular a largura total dos caracteres e espaços
  const totalCharsWidth = (charWidth * totalChars) + (charSpacing * (totalChars - 1));

  // Calcular a posição inicial para centralizar os caracteres
  const startX = (plateWidth - totalCharsWidth) / 2;
  const startY = (plateHeight - charHeight) / 2 + 6;

  // Iniciar o SVG com o template da placa
  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${plateWidth}" height="${plateHeight}">`;

  // Adicionar o template da placa
  svgContent += `<image href="${templatePath}" x="0" y="0" width="${plateWidth}" height="${plateHeight}" />`;

  // Adicionar os caracteres
  characters.forEach((char, index) => {
    // Calcular a posição x do caractere
    const xPosition = startX + index * (charWidth + charSpacing);

    // Determinar o caminho para o SVG do caractere
    let charPath = '';
    if (/[A-Z]/.test(char)) {
      charPath = `/assets/plates/letters/${char}.svg`;
    } else if (/[0-9]/.test(char)) {
      charPath = `/assets/plates/numbers/${char}.svg`;
    } else {
      console.warn(`Caractere inválido na placa: ${char}`);
      return;
    }

    // Adicionar o caractere ao SVG
    svgContent += `<image class="letters" href="${charPath}" x="${xPosition}" y="${startY}" width="${charWidth}" height="${charHeight}" />`;
  });

  // Fechar o SVG
  svgContent += `</svg>`;

  // Retornar o SVG completo como uma string
  return svgContent;
};

// Função para carregar o estado inicial do processo com async/await
const loadInitialProcessState = async () => {
  try {
    const response = await fetch('/process-status'); // Endpoint para verificar o status do processo
    
    // Verifique se a resposta foi bem-sucedida
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const processStatusResponse = await response.json(); // Obtém o JSON da resposta
    const processes = processStatusResponse.processes || [];
    console.log('Process Status: ', processStatusResponse)
    // Criar um mapeamento de IP para estado
    const ipStatusMap = {};
    processes.forEach(process => {
      ipStatusMap[process.ip] = process.status.state;
    });

    const statusMarquee = document.getElementById('status-marquee');
    
    // Inicializar variáveis para determinar o estado geral
    let overallStatus = 'stopped';
    let statusColor = 'red';
    let statusText = 'Processo parado';
    let textColor = 'white';
    
    // Determinar o estado geral com base nos estados individuais
    for (const process of processes) {
      const status = process.status.state;
      if (status === 'running') {
        overallStatus = 'running';
        statusColor = 'green';
        statusText = 'Processo em execução';
        break; // Prioridade para 'running'
      } else if (status === 'connecting') {
        overallStatus = 'starting';
        statusColor = 'yellow';
        statusText = 'Conectando...'
        textColor = 'black';
      } else if (status === 'reconnecting') {
        overallStatus = 'reconnecting';
        statusColor = 'orange';
        statusText = 'Reconectando...';
      } else if (status === 'error') {
        overallStatus = 'error';
        statusColor = 'red';
        statusText = 'Erro no processo';
      }
    }

    // Atualizar o letreiro de status com base no estado geral
    statusMarquee.textContent = statusText;
    statusMarquee.style.color = textColor;
    statusMarquee.style.backgroundColor = statusColor;

    // Atualizar os círculos de status na tabela
    processes.forEach(process => {
      updateStatusCircle(process.ip, process.status.state);
    });

  } catch (error) {
    console.error('Erro ao carregar o estado inicial do processo:', error);
  }
};

// Function to load Controle
const loadControle = () => {
  const mainContent = document.getElementById('main-content');
  document.getElementById('page-title').innerText = 'Dashboard';

  // Limpar o conteúdo anterior
  mainContent.innerHTML = '';

  // Criar o letreiro de status com texto inicial
  const statusMarquee = document.createElement('div');
  statusMarquee.id = 'status-marquee';
  statusMarquee.className = 'status-marquee';
  statusMarquee.style.padding = '10px'; // Adicionar padding
  statusMarquee.style.borderRadius = '5px'; // Adicionar borda arredondada
  mainContent.appendChild(statusMarquee);

  // Carregar o estado inicial do processo
  loadInitialProcessState();

  // Obter o número de canais/câmeras em uso
  fetch('/active-channels')
    .then(response => response.json())
    .then(channels => {
      // Criar contêiner para as tabelas
      const tablesContainer = document.createElement('div');
      tablesContainer.className = 'tables-container';

      // Dividir a tela de acordo com o número de canais
      channels.forEach(channel => {
        // Criar uma tabela para cada canal
        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-wrapper';

        const tableTitle = document.createElement('h3');
        tableTitle.textContent = `Canal ${channel.number} - ${channel.cameraName || 'Câmera'}`;
        tableWrapper.appendChild(tableTitle);

        const table = document.createElement('table');
        table.className = 'controle-table';
        table.innerHTML = `
          <thead>
            <tr>
              <th>Nome</th>
              <th>Grupo</th>
              <th>Unidade</th>
              <th>Marca</th>
              <th>Modelo</th>
              <th>Cor</th>
              <th>Placa</th>
              <th>Data/Hora</th>
            </tr>
          </thead>
          <tbody id="table-body-${channel.number}">
            <!-- Linhas serão adicionadas dinamicamente -->
          </tbody>
        `;
        tableWrapper.appendChild(table);
        tablesContainer.appendChild(tableWrapper);

        // Buscar os últimos 20 eventos para este canal
        fetch(`/events/${channel.number}`)
          .then(response => response.json())
          .then(events => {
            events.forEach(event => {
              updateControleTable(event);
            });
          })
          .catch(error => {
            console.error(`Erro ao carregar eventos para o canal ${channel.number}:`, error);
          });
      });

      mainContent.appendChild(tablesContainer);

      // Configurar os listeners Socket.IO para a página Controle
      // setupControleSocket();
    })
    .catch(error => {
      console.error('Erro ao carregar os canais ativos:', error);
      mainContent.innerHTML = '<p>Erro ao carregar a página de controle.</p>';
    });
};

// Função para carregar a página de Eventos
const loadEventos = () => {
  const mainContent = document.getElementById('main-content');
  document.getElementById('page-title').innerText = 'Eventos'; // Título da página

  // Limpar o conteúdo anterior
  mainContent.innerHTML = '';

  // Buscar os dados de placas para construir o mapa de grupos e unidades
  fetch('/plates')
    .then(response => response.json())
    .then(platesData => {
      // Criar um mapeamento de 'Grupo' para suas 'Unidades'
      const grupoUnidadeMap = {};
      platesData.forEach(user => {
        const grupo = user.grupo;
        const unid = user.unid;

        if (!grupoUnidadeMap[grupo]) {
          grupoUnidadeMap[grupo] = new Set();
        }
        grupoUnidadeMap[grupo].add(unid);
      });

      // Extrair valores únicos de 'Grupo'
      const grupos = Object.keys(grupoUnidadeMap).sort();

      // Criar filtros com duas linhas
      const filtersHTML = `
        <div class="filter-container">
          <div class="filter-row">
            <input type="text" id="filter-nome-evento" placeholder="Filtrar por Nome">
            <select id="filter-grupo-evento">
              <option value="">Selecione um Grupo</option>
              ${grupos.map(grupo => `<option value="${grupo}">${grupo}</option>`).join('')}
            </select>
            <select id="filter-unidade-evento" disabled>
              <option value="">Selecione uma Unidade</option>
            </select>
            <input type="text" id="filter-placa-evento" placeholder="Filtrar por Placa">
          </div>
          <div class="filter-row">
            <input type="datetime-local" id="filter-data-inicial-evento" placeholder="Data/Hora Inicial">
            <input type="datetime-local" id="filter-data-final-evento" placeholder="Data/Hora Final">
            <button id="filter-clear-evento">Limpar Filtros</button>
          </div>
        </div>
      `;

      // Criar a tabela de eventos
      const tableHTML = `
        <table id="eventos-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Grupo</th>
              <th>Unidade</th>
              <th>Marca</th>
              <th>Modelo</th>
              <th>Cor</th>
              <th>Placa</th>
              <th>Data/Hora</th>
            </tr>
          </thead>
          <tbody>
            <!-- Eventos serão inseridos aqui -->
          </tbody>
        </table>
      `;

      // Adicionar filtros e tabela ao conteúdo principal
      mainContent.innerHTML = filtersHTML + tableHTML;

      // Armazenar o grupoUnidadeMap para uso posterior
      window.grupoUnidadeMap = grupoUnidadeMap;

      // Adicionar event listeners aos filtros
      document.getElementById('filter-grupo-evento').addEventListener('change', handleGrupoChangeEvento);
      document.getElementById('filter-unidade-evento').addEventListener('change', applyEventoFilters);
      document.getElementById('filter-nome-evento').addEventListener('input', applyEventoFilters);
      document.getElementById('filter-placa-evento').addEventListener('input', applyEventoFilters);
      document.getElementById('filter-data-inicial-evento').addEventListener('change', applyEventoFilters);
      document.getElementById('filter-data-final-evento').addEventListener('change', applyEventoFilters);
      document.getElementById('filter-clear-evento').addEventListener('click', clearEventoFilters);

      // Aplicar filtros iniciais (carregar todos os eventos)
      applyEventoFilters();
    })
    .catch(error => {
      console.error('Erro ao carregar os dados de placas:', error);
      mainContent.innerHTML = '<p>Erro ao carregar a página de eventos.</p>';
    });
};

// Função para lidar com mudanças no select de Grupo na página de Eventos
const handleGrupoChangeEvento = () => {
  const grupoSelect = document.getElementById('filter-grupo-evento');
  const unidadeSelect = document.getElementById('filter-unidade-evento');
  const selectedGrupo = grupoSelect.value;

  // Limpar as opções do select de Unidade
  unidadeSelect.innerHTML = '';

  if (selectedGrupo === '') {
    // Nenhum grupo selecionado, desabilitar o select de Unidade
    unidadeSelect.disabled = true;
    unidadeSelect.innerHTML = '<option value="">Selecione uma Unidade</option>';
  } else {
    // Grupo selecionado, habilitar o select de Unidade e popular opções
    unidadeSelect.disabled = false;

    const unidades = Array.from(window.grupoUnidadeMap[selectedGrupo]).sort();

    unidadeSelect.innerHTML = `
      <option value="">Todas as Unidades</option>
      ${unidades.map(unid => `<option value="${unid}">${unid}</option>`).join('')}
    `;
  }

  // Aplicar filtros ao mudar o Grupo
  applyEventoFilters();
};

// Função para aplicar os filtros na página de Eventos
const applyEventoFilters = async () => {
  const nome = document.getElementById('filter-nome-evento').value.trim();
  const grupoSelect = document.getElementById('filter-grupo-evento');
  const grupo = grupoSelect.value;
  const unidadeSelect = document.getElementById('filter-unidade-evento');
  const unidade = unidadeSelect.disabled ? '' : unidadeSelect.value;
  const placa = document.getElementById('filter-placa-evento').value.trim();
  const dataHoraInicial = document.getElementById('filter-data-inicial-evento').value;
  const dataHoraFinal = document.getElementById('filter-data-final-evento').value;

  // Construir a URL com os parâmetros de consulta
  const params = new URLSearchParams();

  if (nome) params.append('nome', nome);
  if (grupo) params.append('grupo', grupo);
  if (unidade) params.append('unidade', unidade);
  if (placa) params.append('placa', placa);
  if (dataHoraInicial) params.append('dataHoraInicial', dataHoraInicial);
  if (dataHoraFinal) params.append('dataHoraFinal', dataHoraFinal);

  try {
    const response = await fetch(`/filtered-events?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error('Erro ao buscar eventos filtrados.');
    }

    const eventos = await response.json();
    renderEventosTable(eventos);
  } catch (error) {
    console.error(error);
    showSnackMessage('Erro ao buscar eventos filtrados.', 'error');
  }
};

// Função para limpar os filtros e a tabela
const clearEventoFilters = () => {
  document.getElementById('filter-nome-evento').value = '';
  document.getElementById('filter-grupo-evento').value = '';
  document.getElementById('filter-unidade-evento').innerHTML = '<option value="">Selecione uma Unidade</option>';
  document.getElementById('filter-unidade-evento').disabled = true;
  document.getElementById('filter-placa-evento').value = '';
  document.getElementById('filter-data-inicial-evento').value = '';
  document.getElementById('filter-data-final-evento').value = '';
  
  // Limpar a tabela
  const tbody = document.querySelector('#eventos-table tbody');
  tbody.innerHTML = '';
};

// Função para renderizar os eventos na tabela
const renderEventosTable = (eventos) => {
  const tbody = document.querySelector('#eventos-table tbody');
  tbody.innerHTML = ''; // Limpar tabela antes de renderizar

  eventos.forEach(evento => {
    const { customerInfo, timestamp } = evento;

    const plateSVG = generatePlateSVG(customerInfo.plate);

    const rowHTML = `
      <tr>
        <td>${customerInfo.name || 'Desconhecido'}</td>
        <td>${customerInfo.group || ''}</td>
        <td>${customerInfo.unit || ''}</td>
        <td>${customerInfo.make || ''}</td>
        <td>${customerInfo.model || ''}</td>
        <td>${customerInfo.color || ''}</td>
        <td>
          <div class="plate-svg-container">
            ${plateSVG}
          </div>
        </td>
        <td>${formatTimestamp(timestamp)}</td>
      </tr>
    `;

    tbody.insertAdjacentHTML('beforeend', rowHTML);
  });

  if (eventos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8">Nenhum evento encontrado.</td></tr>';
  }
};

socket.on('performance-report', (data) => {
  // Desestruturar os dados recebidos
  const { ip, avgFps, cpuUsage, ramUsage, gpuUsage, gpuMemoryUsage } = data;

  // Encontrar a linha correspondente ao IP na tabela de configurações
  const rows = document.querySelectorAll('#main-content table tbody tr');
  for (const row of rows) {
    const ipCell = row.cells[1];
    if (ipCell && ipCell.textContent.trim() === ip) {

      // Atualizar as células com os dados de desempenho
      let fpsCell = row.querySelector('.fps-cell');
      if (!fpsCell) {
        // Se a célula não existir, criar e adicionar
        fpsCell = document.createElement('td');
        fpsCell.classList.add('fps-cell');
        row.appendChild(fpsCell);
      }

      fpsCell.innerHTML = `
      <div>FPS: ${avgFps.toFixed(2)}</div>
    `;

    let performanceCPUCell = row.querySelector('.performance-cpu-cell');
    if (!performanceCPUCell) {
      // Se a célula não existir, criar e adicionar
      performanceCPUCell = document.createElement('td');
      performanceCPUCell.classList.add('performance-cpu-cell');
      row.appendChild(performanceCPUCell);
    }

      performanceCPUCell.innerHTML = `
        <div>CPU: ${cpuUsage}%</div>
        <div>RAM: ${ramUsage}%</div>
      `;

      let performanceGPUCell = row.querySelector('.performance-gpu-cell');
      if (!performanceGPUCell) {
        // Se a célula não existir, criar e adicionar
        performanceGPUCell = document.createElement('td');
        performanceGPUCell.classList.add('performance-gpu-cell');
        row.appendChild(performanceGPUCell);
      }

      performanceGPUCell.innerHTML = `
      <div>GPU: ${gpuUsage}%</div>
      <div>VRAM: ${gpuMemoryUsage}%</div>
    `;
      break;
    }
  }
});

// // Função para lidar com o evento 'process-started'
// socket.on('process-started', ({ ip }) => {
//   console.log(`Processo iniciado com sucesso para IP: ${ip}`);
  
//   const button = findButtonByIP(ip);
//   if (button) {
//     const config = statusConfig['running'];
//     button.setAttribute('data-status', 'running');
//     button.setAttribute('title', config.title);
//     button.innerHTML = `<i data-feather="${config.icon}"></i>`;
//     feather.replace();
//     button.disabled = false;
//     showSnackMessage(`Reconhecimento iniciado para a câmera ${ip}.`, 'info');
    
//     // Atualizar o círculo de status para verde
//     updateStatusCircle(ip, 'running');
//   }
// });

// // Função para lidar com o evento 'process-error'
// socket.on('process-error', ({ ip, errorType }) => {
//   console.error(`Process error for IP: ${ip}`, errorType);
//   const button = findButtonByIP(ip);
//   if (button) {
//     const config = statusConfig['error'];
//     button.setAttribute('data-status', 'error');
//     button.setAttribute('title', config.title);
//     button.innerHTML = `<i data-feather="${config.icon}"></i>`;
//     feather.replace();
//     button.disabled = false;

//     // Mapear o errorType para mensagens específicas
//     let message = 'Erro ao iniciar o reconhecimento.';
//     if (errorType === 'connection_timeout') {
//       message += ' Connection Timeout!';
//     } else if (errorType === 'credentials_unauthorized') {
//       message += ' Credenciais não autorizadas!';
//     }

//     showSnackMessage(message, 'error');
    
//     // Atualizar o círculo de status para vermelho
//     updateStatusCircle(ip, 'error');
//   }
// });

// // Função para lidar com o evento 'process-stopped'
// socket.on('process-stopped', ({ ip }) => {
//   console.log(`Process stopped for IP: ${ip}`);
//   const button = findButtonByIP(ip);
//   if (button) {
//     const config = statusConfig['stopped'];
//     button.setAttribute('data-status', 'stopped');
//     button.setAttribute('title', config.title);
//     button.innerHTML = `<i data-feather="${config.icon}"></i>`;
//     feather.replace();
//     button.disabled = false;
//     showSnackMessage(`Processo parado`, 'info');
    
//     // Atualizar o círculo de status para vermelho
//     updateStatusCircle(ip, 'stopped');
//   }
// });

// // Manipulador para o evento 'process-starting'
// socket.on('process-starting', ({ ip }) => {
//   console.log('process-starting');
//   const statusMarquee = document.getElementById('status-marquee');
//   statusMarquee.textContent = `Conectando...`;
//   statusMarquee.style.color = 'black'; // Letras em preto
//   statusMarquee.style.backgroundColor = 'yellow'; // Cor para 'starting'
  
//   // Atualizar o status da tabela
//   updateStatusCircle(ip, 'starting');

//   // Mostrar mensagem de snack
//   showSnackMessage(`Processo em inicialização para a câmera ${ip}.`, 'info');
// });

// // Manipulador para o evento 'process-reconnecting'
// socket.on('process-reconnecting', ({ ip }) => {
//   console.log('process-reconnecting');
//   const statusMarquee = document.getElementById('status-marquee');
//   statusMarquee.textContent = `Reconectando...: ${ip}`;
//   statusMarquee.style.color = 'black'; // Letras em preto
//   statusMarquee.style.backgroundColor = 'orange'; // Cor para 'reconnecting'
  
//   // Atualizar o status da tabela
//   updateStatusCircle(ip, 'reconnecting');

//   // Mostrar mensagem de snack
//   showSnackMessage(`Reconectando ao processo para a câmera ${ip}.`, 'info');
// });

// socket.on('plate-found', ({ ip, data }) => {
//   console.log('Placa detectada: ', ip, data);
// });

// socket.on('plate-not-found', ({ ip, plate }) => {
//   console.log('Placa detectada:', ip, plate);
// });

// Helper function to find the button by IP address
const findButtonByIP = (ip) => {
  console.log(`Procurando botão para IP: ${ip}`);
  const rows = document.querySelectorAll('#main-content table tbody tr');
  for (const row of rows) {
    const ipCell = row.cells[1]; 
    if (ipCell && ipCell.textContent.trim() === ip) {
      const button = row.querySelector('.play-button');
      if (button) {
        console.log(`Botão encontrado para IP: ${ip}`);
        return button;
      } else {
        console.warn(`Botão de play não encontrado para IP: ${ip}`);
      }
    }
  }
  console.warn(`Nenhum botão encontrado para IP: ${ip}`);
  return null;
};

// Event listeners for menu links
document.getElementById('cadastros-link').addEventListener('click', (e) => {
  e.preventDefault();
  loadCadastros();
});

document.getElementById('configuracoes-link').addEventListener('click', (e) => {
  e.preventDefault();
  loadConfiguracoes();
});

document.getElementById('controle-link').addEventListener('click', (e) => {
  e.preventDefault();
  loadControle();
});

document.getElementById('eventos-link').addEventListener('click', (e) => {
  e.preventDefault();
  loadEventos();
});

// Função para formatar a data para exibição
const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleString('pt-BR');
};

// Load Cadastros by default on page load
window.onload = setupControleSocket;