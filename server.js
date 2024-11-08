// server.js
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Datastore = require('nedb');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server);
const net = require('net');

const PORT = 4000; 

// Initialize NeDB databases
const platesDb = new Datastore({ filename: 'plates.db', autoload: true });
const settingsDb = new Datastore({ filename: 'settings.db', autoload: true });
const mg3000Db = new Datastore({ filename: 'mg3000.db', autoload: true });
const eventsDb = new Datastore({ filename: 'events.db', autoload: true });

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// **Serve Static Files**
app.use(express.static(path.join(__dirname, 'public')));

// Mapeamento dos processos ativos por IP da câmera
const activeProcesses = {};

// Estrutura para armazenar dados de desempenho por IP
const performanceData = {};

// Estrutura para armazenar dados de configuraçoes momentaneas da camera
const cameraSettings = {};

// Serve static files (like index.html, script.js, etc.)
app.use(express.static('public'));

function mapChannelOccupied(channelOccupied) {
  const channelMap = {
    'chan1': '1',
    'chan2': '2',
    'chan3': '3',
    'chan4': '4'
  };
  return channelMap[channelOccupied] || '1';
}

// Endpoint to receive POST requests for /sync-plates
app.post('/sync', (req, res) => {
  const data = req.body;

  if (!Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid data format. Expected an array.' });
  }

  // Remove all existing data in platesDb
  platesDb.remove({}, { multi: true }, (err, numRemoved) => {
    if (err) {
      console.error('Error removing data from platesDb:', err);
      return res.status(500).json({ error: 'Failed to clear plates database.' });
    }

    console.log(`Removed ${numRemoved} records from platesDb.`);

    // Insert new data into platesDb
    platesDb.insert(data, (err, newDocs) => {
      if (err) {
        console.error('Error saving data to platesDb:', err);
        return res.status(500).json({ error: 'Failed to save data to plates database.' });
      }

      console.log('Data saved to platesDb:', newDocs);
      res.status(200).json({ message: 'Data saved successfully to plates database.', savedRecords: newDocs.length });
    });
  });
});

// Endpoint to receive POST requests for /settings
app.post('/settings', (req, res) => {
  const data = req.body;

  // Remove all existing data in settingsDb
  settingsDb.remove({}, { multi: true }, (err, numRemoved) => {
    if (err) {
      console.error('Error removing data from settingsDb:', err);
      return res.status(500).json({ error: 'Failed to clear settings database.' });
    }

    console.log(`Removed ${numRemoved} records from settingsDb.`);

    // Insert new data into settingsDb
    settingsDb.insert(data, (err, newDocs) => {
      if (err) {
        console.error('Error saving data to settingsDb:', err);
        return res.status(500).json({ error: 'Failed to save data to settings database.' });
      }

      console.log('Data saved to settingsDb:', newDocs);
      res.status(200).json({ message: 'Data saved successfully to settings database.', savedRecords: newDocs.length });
    });
  });
});

// Endpoint to retrieve all plates
app.get('/plates', (req, res) => {
    platesDb.find({}, (err, docs) => {
      if (err) {
        console.error('Error retrieving data from platesDb:', err);
        return res.status(500).json({ error: 'Failed to retrieve data from plates database.' });
      }
  
      res.status(200).json(docs);
    });
  });
  
  // Endpoint to retrieve all settings
  app.get('/settings', (req, res) => {
    settingsDb.find({}, (err, docs) => {
      if (err) {
        console.error('Error retrieving data from settingsDb:', err);
        return res.status(500).json({ error: 'Failed to retrieve data from settings database.' });
      }
  
      // Map over the docs and add device and skipFrames from cameraSettings
      const enrichedDocs = docs.map(camera => {
        const ip = camera.equipAdd;
        const settings = cameraSettings[ip] || {};
        return {
          ...camera,
          device: settings.device || 'cpu',
          skipFrames: settings.skipFrames || 3
        };
      });

      res.status(200).json(enrichedDocs);
    });
  });

  app.get('/performance-data', (req, res) => {
    res.json(performanceData);
  });

// Função para iniciar o reconhecimento
const startRecognition = (ip, user, password, device, frameRate, res) => {
  if (activeProcesses[ip] && (activeProcesses[ip].state === 'connecting' || activeProcesses[ip].state === 'running')) {
    console.log(`Processo já em execução ou em tentativa de conexão para IP: ${ip}`);
    if (res) {
      return res.status(400).json({ message: 'Processo já em execução ou em tentativa de conexão para este IP.' });
    } else {
      return;
    }
  }

  // Encontrar as configurações da câmera para o IP fornecido
  settingsDb.findOne({ equipAdd: ip }, (err, cameraSettings) => {
    if (err || !cameraSettings) {
      console.error(`Não foi possível encontrar as configurações da câmera para o IP ${ip}`);
      if (res) res.status(500).json({ error: 'Erro ao iniciar o reconhecimento.' });
      return;
    }

    const channelOccupied = cameraSettings.channelOccupied;
    const channelNumber = parseInt(mapChannelOccupied(channelOccupied));

    // Agora, obter a configuração do MG3000 para este canal
    mg3000Db.findOne({ channel: channelNumber }, (err, mg3000Config) => {
      if (err || !mg3000Config) {
        console.error(`Não foi possível encontrar a configuração MG3000 para o canal ${channelNumber}`);
        if (res) res.status(500).json({ error: 'Erro ao iniciar o reconhecimento.' });
        return;
      }

     // const process = spawn('python3', ['plate.py', '--ip', ip, '--user', user, '--password', password]);
     const process = spawn('python3', ['stream.py', '--ip', ip, '--user', user, '--password', password, '--frame_rate', frameRate.toString(), '--device', device]);
     console.log('python', 'stream.py', '--ip', ip, '--user', user, '--password', password, '--frame_rate', frameRate.toString(), '--device', device)
   
     // Lista de padrões de aviso
     const warningPatterns = [
       /DeprecationWarning/,
       /WARNING/,
       /Note:/,
       /Using CPU/,
       /.*will be deprecated.*/,
       /.* is deprecated/,
       /.*is deprecated/,
       /.*deprecated/,
       /.*is going to be deprecated/,
       /.*replaced by.*/,
       /.*RuntimeWarning.*/,
       /.*UserWarning.*/,
       /.*FutureWarning.*/
     ];
   
     // Função para categorizar erros
     const categorizeError = (errorOutput) => {
       if (errorOutput.includes('Stream timeout')) {
         return 'connection_timeout';
       } else if(errorOutput.includes('unreachable')) {
         return 'network_unreachable';
       } else if (errorOutput.includes('401')) {
         return 'credentials_unauthorized';
       } else {
         return 'other_error';
       }
     };
   
     // Emit event to client indicating the process is starting
     io.emit('process-starting', { ip });
   
     // Inicializar o objeto do processo ativo com o estado 'connecting'
     activeProcesses[ip] = {
       process: process,
       state: 'connecting', // Novo campo de estado
       hasError: false,
       lastPlateDetectionTime: 0,
       retryTimeout: null,
       user: user,
       password: password
     };
   
     let hasStarted = false; // Flag para rastrear se o processo iniciou com sucesso
   
     const platePatterns = [
       /LP-\/\/(.+?)\/\/-LP/g
     ];
   
     // Lidando com a saída do processo
     process.stdout.on('data', (data) => {
       const output = data.toString();
   
       // Check for specific output indicating the process has started
       if (!hasStarted && output.includes('Process Started Successfully')) {
         hasStarted = true;
         console.log('Process Started Successfully');
         activeProcesses[ip].state = 'running'; // Atualizar estado para 'running'
         io.emit('process-started', { ip });
         // Enviar a resposta de sucesso ao cliente
         if (res) {
           res.status(200).json({ message: 'Processo de reconhecimento iniciado.' });
         }
       }
   
       // Procurar por placas nas saídas
       platePatterns.forEach(pattern => {
         let match;
         while ((match = pattern.exec(output)) !== null) {
           const plateData = match[1].trim(); // Dados da placa capturados
           console.log(`Placa detectada: ${plateData}`);
   
           let channelNumber;
   
           // Passo 1: Encontrar a câmera com base no IP
           settingsDb.findOne({ equipAdd: ip }, (err, camera) => {
             if (err || !camera) {
               console.error(`Câmera com IP ${ip} não encontrada no settingsDb.`);
               return;
             }
   
             // Obter o canal ocupado pela câmera
             const channelOccupied = camera.channelOccupied; // 'chan1', 'chan2', etc.
             const channelNumberMap = {
               'chan1': 1,
               'chan2': 2,
               'chan3': 3,
               'chan4': 4
             };
             channelNumber = channelNumberMap[channelOccupied];
   
             if (!channelNumber) {
               console.error(`Canal ocupado não identificado para a câmera com IP ${ip}.`);
               return;
             }
           });
   
           // Consultar o banco de dados para verificar a correspondência
           platesDb.find({}, (err, docs) => {
             if (err) {
               console.error('Erro ao consultar platesDb:', err);
               return;
             }
   
             let plateFound = false;
   
             // Iterar sobre cada documento para verificar os dispositivos
             for (const doc of docs) {
               const { userName, unid, grupo, devices } = doc;
               for (const device of devices) {
                 const dbPlate = device.plate;
                 if (platesMatch(plateData, dbPlate)) {
                   console.log(`Placa correspondente encontrada: ${dbPlate}`);
   
                   // Verificar o intervalo de supressão aqui
                   const now = Date.now();
                   const lastTime = activeProcesses[ip].lastPlateDetectionTime || 0;
   
                   // Verificar se passaram 5 segundos desde a última detecção
                   if (now - lastTime < 5000) {
                     console.log(`Ignorando placa detectada em ${ip} devido ao intervalo de supressão.`);
                     plateFound = true; // Marcar como encontrada para não processar placas não correspondentes
                     break; // Sair do loop, pois já encontramos uma correspondência
                   }
   
                   // Atualizar o lastPlateDetectionTime para o IP
                   activeProcesses[ip].lastPlateDetectionTime = now;
   
                   openDoor(ip);
   
                   const timestamp = new Date();
   
                   const customerInfo = {
                     plate: dbPlate,
                     name: userName,
                     group: grupo,
                     unit: unid,
                     make: device.make,
                     model: device.model,
                     color: device.color,
                   };
   
                   const event = {
                     channelNumber: channelNumber,
                     customerInfo: customerInfo,
                     timestamp: timestamp
                   };
   
                   // Salvar o evento no banco de dados
                   eventsDb.insert(event, (err, newDoc) => {
                     if (err) {
                       console.error('Erro ao salvar o evento no banco de dados:', err);
                     } else {
                       console.log('Evento salvo no banco de dados:', newDoc);
                     }
                   });
   
                   // Emitir o evento 'plate-found' com os dados adicionais
                   io.emit('plate-found', event);
                   plateFound = true;
                   break; // Parar após encontrar a primeira correspondência
                 }
               }
               if (plateFound) break;
             }
   
             if (!plateFound) {
               console.log(`Nenhuma correspondência encontrada para a placa: ${plateData}`);
               // Opcional: Emitir um evento indicando que a placa não foi encontrada
               io.emit('plate-not-found', { ip, plate: plateData });
             }
   
           });
         }
       });
   
       // Verificar se a saída é um relatório de desempenho
       if (output.startsWith('Performance Report:')) {
         // Usar expressão regular para extrair métricas
         const regex = /Performance Report: Avg FPS: ([\d\.]+), CPU Usage: ([\d\.]+)%, RAM Usage: ([\d\.]+)%, GPU Usage: ([\d\.]+)%, GPU Memory Usage: ([\d\.]+)%/;
         const match = regex.exec(output);
         if (match) {
           const avgFps = parseFloat(match[1]);
           const cpuUsage = parseFloat(match[2]);
           const ramUsage = parseFloat(match[3]);
           const gpuUsage = parseFloat(match[4]);
           const gpuMemoryUsage = parseFloat(match[5]);
   
           // Armazenar os dados
           performanceData[ip] = {
             avgFps,
             cpuUsage,
             ramUsage,
             gpuUsage,
             gpuMemoryUsage
           };
   
           // Emitir evento via Socket.IO para o cliente
           io.emit('performance-report', {
             ip,
             avgFps,
             cpuUsage,
             ramUsage,
             gpuUsage,
             gpuMemoryUsage
           });
         }
       }
   
     });
   
     async function openDoor(ip) {
       try {
         console.log('Opening Door');
         // Passo 1: Encontrar a câmera com base no IP
         settingsDb.findOne({ equipAdd: ip }, (err, camera) => {
           if (err || !camera) {
             console.error(`Câmera com IP ${ip} não encontrada no settingsDb.`);
             return;
           }
   
           // Obter o canal ocupado pela câmera
           const channelOccupied = camera.channelOccupied; // 'chan1', 'chan2', etc.
           const channelNumberMap = {
             'chan1': 1,
             'chan2': 2,
             'chan3': 3,
             'chan4': 4
           };
   
           const channelNumber = channelNumberMap[channelOccupied];
   
           if (!channelNumber) {
             console.error(`Canal ocupado não identificado para a câmera com IP ${ip}.`);
             return;
           }
   
           // Passo 2: Obter as configurações do MG3000 para esse canal
           mg3000Db.findOne({ channel: channelNumber }, (err, mg3000Config) => {
             if (err || !mg3000Config) {
               console.error(`Configuração do MG3000 não encontrada para o canal ${channelNumber}.`);
               return;
             }
   
             // Extrair os parâmetros necessários
             const mg3000Address = mg3000Config.mg3000Address;
             const receptorAddress = parseInt(mg3000Config.receptorAddress, 10); // Convertendo para inteiro
             const portAddress = parseInt(mg3000Config.portAddress, 10); // Convertendo para inteiro
   
             if (!mg3000Address || isNaN(receptorAddress) || isNaN(portAddress)) {
               console.error(`Parâmetros inválidos para o canal ${channelNumber}.`);
               return;
             }
   
             // Passo 3: Executar a função openRfDoor
             openRfDoor(mg3000Address, 9000, receptorAddress, portAddress)
               .then(() => {
                 console.log(`Comando enviado para abrir a porta no canal ${channelNumber}.`);
               })
               .catch((error) => {
                 console.error('Erro ao enviar o comando openRfDoor:', error);
               });
           });
         });
       } catch (error) {
         console.log(error);
       }
     }
   
     /**
      * Compara duas placas e verifica se elas correspondem.
      * As placas correspondem se:
      * - Têm o mesmo comprimento.
      * - Têm no máximo uma diferença de caractere na mesma posição.
      * 
      * @param {string} detectedPlate - A placa detectada pelo sistema.
      * @param {string} dbPlate - A placa armazenada no banco de dados.
      * @returns {boolean} - Retorna true se as placas corresponderem, false caso contrário.
      */
     function platesMatch(detectedPlate, dbPlate) {
       if (detectedPlate.length !== dbPlate.length) return false;
   
       let diffCount = 0;
   
       for (let i = 0; i < detectedPlate.length; i++) {
         if (detectedPlate[i] !== dbPlate[i]) {
           diffCount++;
           if (diffCount > 1) return false;
         }
       }
       return diffCount <= 1;
     }
   
     // Manipulador de erros do processo
     process.stderr.on('data', (data) => {
       const errorOutput = data.toString();
       console.error(`stderr [${ip}]: ${errorOutput}`);
   
       // Verificar se a mensagem é um aviso
       const isWarning = warningPatterns.some(pattern => pattern.test(errorOutput));
   
       if (!isWarning) {
         // Categorizar o erro
         const errorType = categorizeError(errorOutput);
   
         if (errorType === 'connection_timeout') {
           console.error(`Timeout de conexão detectado para IP: ${ip}`);
   
           // Emitir o evento com o tipo de erro
           if (!activeProcesses[ip].hasError) {
             activeProcesses[ip].hasError = true; // Marcar que ocorreu um erro
             activeProcesses[ip].state = 'error'; // Atualizar estado para 'error'
             io.emit('process-error', { ip, errorType });
   
             // Agendar a reconexão após 10 segundos
             if (!activeProcesses[ip].retryTimeout) { // Verifica se já não há uma tentativa agendada
               console.log(`Agendando reconexão para IP: ${ip} em 10 segundos.`);
               activeProcesses[ip].process = null; // Limpar o processo atual
               activeProcesses[ip].retryTimeout = setTimeout(() => {
                 console.log(`Tentando reconectar para IP: ${ip}`);
                 // Resetar o estado de erro antes de tentar reconectar
                 activeProcesses[ip].hasError = false;
                 // activeProcesses[ip].state = 'connecting';
                 activeProcesses[ip].retryTimeout = null;
                 // Iniciar o reconhecimento novamente
                 startRecognition(ip, activeProcesses[ip].user, activeProcesses[ip].password, device, frameRate, null); // Res.json não será chamado novamente
                 // Emitir evento de tentativa de reconexão
                 io.emit('process-reconnecting', { ip });
               }, 10000); // 10 segundos
             }
           }
         } else if (errorType === 'network_unreachable') {
           console.error(`Sem conexão com a rede`);
   
           // Emitir o evento com o tipo de erro
           if (!activeProcesses[ip].hasError) {
             activeProcesses[ip].hasError = true; // Marcar que ocorreu um erro
             activeProcesses[ip].state = 'error'; // Atualizar estado para 'error'
             io.emit('process-error', { ip, errorType });
   
             // Agendar a reconexão após 10 segundos
             if (!activeProcesses[ip].retryTimeout) { // Verifica se já não há uma tentativa agendada
               console.log(`Agendando reconexão para IP: ${ip} em 10 segundos.`);
               activeProcesses[ip].process = null; // Limpar o processo atual
               activeProcesses[ip].retryTimeout = setTimeout(() => {
                 console.log(`Tentando reconectar para IP: ${ip}`);
                 // Resetar o estado de erro antes de tentar reconectar
                 activeProcesses[ip].hasError = false;
                 // activeProcesses[ip].state = 'connecting';
                 activeProcesses[ip].retryTimeout = null;
                 // Iniciar o reconhecimento novamente
                 startRecognition(ip, activeProcesses[ip].user, activeProcesses[ip].password, device, frameRate, null); // Res.json não será chamado novamente
                 // Emitir evento de tentativa de reconexão
                 io.emit('process-reconnecting', { ip });
               }, 10000); // 10 segundos
             }
           }
         } else if (errorType === 'credentials_unauthorized') {
           // Erro de credenciais não autorizado - não tentar reconectar
           if (!activeProcesses[ip].hasError) {
             activeProcesses[ip].hasError = true; // Marcar que ocorreu um erro
             activeProcesses[ip].state = 'error'; // Atualizar estado para 'error'
             io.emit('process-error', { ip, errorType });
             // Não agendar reconexão
           }
         } else {
           // Outros tipos de erro - pode decidir como tratar
           if (!activeProcesses[ip].hasError) {
             activeProcesses[ip].hasError = true; // Marcar que ocorreu um erro
             activeProcesses[ip].state = 'error'; // Atualizar estado para 'error'
             io.emit('process-error', { ip, errorType });
             // Pode optar por agendar reconexão ou não
           }
         }
   
         // Matar o processo se ainda estiver ativo
         if (activeProcesses[ip].process) {
           activeProcesses[ip].process.kill('SIGTERM');
         }
       } else {
         // Opcional: Emitir um evento de aviso para o cliente, se necessário
         console.log(`Aviso para IP ${ip}: ${errorOutput}`);
         // io.emit('process-warning', { ip, warning: errorOutput }); // Descomente se quiser emitir avisos
       }
     });
   
     process.on('close', (code, signal) => {
       // Verificar se o processo foi encerrado devido a um erro
       if (activeProcesses[ip] && activeProcesses[ip].state === 'error') {
         // Não emitir 'process-stopped' se houve um erro
         console.log(`Processo para IP ${ip} terminou devido a um erro com código ${code} ou sinal ${signal}`);
       } else {
         if (code !== null) {
           console.log(`Processo para IP ${ip} terminou com código ${code}`);
         }
         if (signal) {
           console.log(`Processo para IP ${ip} foi terminado pelo sinal ${signal}`);
         }
         io.emit('process-stopped', { ip });
         delete activeProcesses[ip];
       }
     });
   
     process.on('error', (error) => {
       console.error(`Erro ao iniciar o processo para IP ${ip}: ${error.message}`);
       if (activeProcesses[ip]) {
         activeProcesses[ip].hasError = true;
         activeProcesses[ip].state = 'error';
         io.emit('process-error', { ip, errorType: 'other_error' });
   
         // Agendar a reconexão após 10 segundos
         if (!activeProcesses[ip].retryTimeout) { // Verifica se já não há uma tentativa agendada
           console.log(`Agendando reconexão para IP: ${ip} em 10 segundos devido a erro ao iniciar o processo.`);
           activeProcesses[ip].process = null; // Limpar o processo atual
           activeProcesses[ip].retryTimeout = setTimeout(() => {
             console.log(`Tentando reconectar para IP: ${ip} após erro ao iniciar.`);
             // Resetar o estado de erro antes de tentar reconectar
             activeProcesses[ip].hasError = false;
             // activeProcesses[ip].state = 'connecting';
             activeProcesses[ip].retryTimeout = null;
             // Iniciar o reconhecimento novamente
             startRecognition(ip, activeProcesses[ip].user, activeProcesses[ip].password, device, frameRate, null); // Res.json não será chamado novamente
             // Emitir evento de tentativa de reconexão
             io.emit('process-reconnecting', { ip });
           }, 10000); // 10 segundos
         }
       }
       if (res) {
         res.status(500).json({ error: 'Erro ao iniciar o processo de reconhecimento.' });
       }

      })  
    })
  })
}

  // Rota para iniciar o reconhecimento
  app.post('/start-recognition', (req, res) => {
    const { ip, user, password, device, frameRate } = req.body;

    if (!ip || !user || !password) {
      return res.status(400).json({ error: 'IP, usuário e senha são obrigatórios.' });
    }
    
    // Iniciar o reconhecimento
    startRecognition(ip, user, password, device, frameRate, res);
  });

  // Rota para parar o reconhecimento
  app.post('/stop-recognition', (req, res) => {
    const { ip } = req.body;

    if (!ip || !activeProcesses[ip]) {
      return res.status(400).json({ message: 'Nenhum processo em execução para este IP.' });
    }

    const process = activeProcesses[ip].process;

    if (process) {
      process.kill('SIGTERM');
    }

    // Limpar o timeout de reconexão, se existir
    if (activeProcesses[ip].retryTimeout) {
      clearTimeout(activeProcesses[ip].retryTimeout);
    }

    delete activeProcesses[ip];

    res.json({ message: 'Reconhecimento parado com sucesso.' });
  });

// Rota para obter o status dos processos
app.get('/process-status', (req, res) => {
  const processes = Object.keys(activeProcesses).map(ip => ({
    ip,
    status: activeProcesses[ip]
  }));
  res.json({ processes });
});

// Funções para atualizar o estado dos processos
const startProcess = (ip) => {
  activeProcesses[ip] = 'starting';
  // Emitir evento 'process-starting' via Socket.IO
  io.emit('process-starting', { ip });

  // Simular processo iniciando
  setTimeout(() => {
    activeProcesses[ip] = 'running';
    io.emit('process-started', { ip });
  }, 2000); // Tempo simulado para iniciar
};

const stopProcess = (ip) => {
  activeProcesses[ip] = 'stopping';
  io.emit('process-stopping', { ip });

  // Simular processo parando
  setTimeout(() => {
    activeProcesses[ip] = 'stopped';
    io.emit('process-stopped', { ip });
  }, 2000); // Tempo simulado para parar
};

// Endpoint to save MG3000 configurations
app.post('/save-mg3000-config', (req, res) => {
  const data = req.body;

  // Remove existing configurations
  mg3000Db.remove({}, { multi: true }, (err, numRemoved) => {
    if (err) {
      console.error('Error removing data from mg3000Db:', err);
      return res.status(500).json({ error: 'Failed to clear MG3000 database.' });
    }

    // Insert new configurations
    mg3000Db.insert(data, (err, newDocs) => {
      if (err) {
        console.error('Error saving data to mg3000Db:', err);
        return res.status(500).json({ error: 'Failed to save MG3000 configurations.' });
      }

      console.log('MG3000 configurations saved:', newDocs);
      res.status(200).json({ message: 'MG3000 configurations saved successfully.', savedRecords: newDocs.length });
    });
  });
});

  // Endpoint to retrieve MG3000 configurations
app.get('/mg3000-config', (req, res) => {
    // Initialize or reference the existing NeDB database for MG3000
    const mg3000Db = new Datastore({ filename: 'mg3000.db', autoload: true });
  
    mg3000Db.find({}, (err, docs) => {
      if (err) {
        console.error('Error retrieving data from mg3000Db:', err);
        return res.status(500).json({ error: 'Failed to retrieve MG3000 configurations.' });
      }
  
      res.status(200).json(docs);
    });
  });

  // Endpoint para obter os canais ativos
app.get('/active-channels', (req, res) => {
    settingsDb.find({}, (err, docs) => {
      if (err) {
        console.error('Erro ao obter os canais ativos:', err);
        return res.status(500).json({ error: 'Erro ao obter os canais ativos.' });
      }
  
      // Mapear os canais ativos
      const channels = docs.map((camera, index) => ({
        number: index + 1, // ou usar camera.channelNumber se disponível
        cameraName: camera.equipName || camera.equipAdd,
      }));
  
      res.json(channels);
    });
  });

  // Endpoint para obter os últimos 20 eventos por canal
app.get('/events/:channelNumber', (req, res) => {
    const channelNumber = parseInt(req.params.channelNumber, 10);
  
    eventsDb.find({ channelNumber: channelNumber })
      .sort({ timestamp: -1 }) // Ordenar do mais recente para o mais antigo
      .limit(10)
      .exec((err, docs) => {
        if (err) {
          console.error('Erro ao recuperar eventos do banco de dados:', err);
          return res.status(500).json({ error: 'Erro ao recuperar eventos.' });
        }
  
        // Inverter a ordem para que o mais recente seja o primeiro no array
        const events = docs.reverse();
  
        res.json(events);
      });
  });

// Endpoint para obter eventos filtrados
app.get('/filtered-events', (req, res) => {
  const { nome, grupo, unidade, placa, dataHoraInicial, dataHoraFinal } = req.query;
  
  // Construir o objeto de consulta
  const query = {};
  
  if (nome) {
    query['customerInfo.name'] = new RegExp(nome, 'i'); // Busca case-insensitive
  }
  
  if (grupo) {
    query['customerInfo.group'] = grupo;
  }
  
  if (unidade) {
    query['customerInfo.unit'] = unidade;
  }
  
  if (placa) {
    query['customerInfo.plate'] = new RegExp(placa, 'i'); // Busca case-insensitive
  }
  
  if (dataHoraInicial || dataHoraFinal) {
    query.timestamp = {};
    if (dataHoraInicial) {
      const inicio = new Date(dataHoraInicial);
      if (!isNaN(inicio)) {
        query.timestamp.$gte = inicio;
      }
    }
    if (dataHoraFinal) {
      const fim = new Date(dataHoraFinal);
      if (!isNaN(fim)) {
        query.timestamp.$lte = fim;
      }
    }
    // Remover timestamp se estiver vazio
    if (Object.keys(query.timestamp).length === 0) {
      delete query.timestamp;
    }
  }
  
  // Consultar o banco de dados
  eventsDb.find(query)
    .sort({ timestamp: -1 }) // Ordenar do mais recente para o mais antigo
    .exec((err, docs) => {
      if (err) {
        console.error('Erro ao recuperar eventos filtrados:', err);
        return res.status(500).json({ error: 'Erro ao recuperar eventos filtrados.' });
      }
      
      res.json(docs);
    });
});

app.get('/performance-data', (req, res) => {
  res.json(performanceData);
});

app.get('/health-check', (req, res) => {
  res.status(200).send('OK');
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // Envie uma mensagem para o processo pai (Electron) informando que o servidor iniciou
  if (process.send) {
    process.send('server-started');
  }
});

// Função para calcular o checksum
function calculateChecksum(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  return sum & 0xff;
}


function openRfDoor(ip, port, rec, door) {
  return new Promise((resolve, reject) => {
    try {
      console.log('Enviando comando para:', ip, port, rec, door);

      const command = Buffer.from([0x00, 0x5C, 0x01, rec, door, 0x01, 0x01]);
      const checksum = calculateChecksum(command);
      const commandWithChecksum = Buffer.concat([command, Buffer.from([checksum])]);

      const socket = net.connect(port, ip, () => {
        socket.write(commandWithChecksum);
      });

      socket.on('data', (data) => {
        console.log('Resposta recebida:', data);
        socket.end();
        resolve(data);
      });

      socket.on('error', (err) => {
        console.error('Erro no socket:', err);
        socket.destroy();
        reject(err);
      });

      socket.on('close', () => {
        console.log('Conexão fechada');
      });
    } catch (error) {
      reject(error);
    }
  });
};
