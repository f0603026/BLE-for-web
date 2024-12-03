document.getElementById('scan-btn').addEventListener('click', async () => {
  try {
    document.getElementById('status').textContent = 'Scanning...';

    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'TB' },
        { name: 'TB430_BLE' },
        { services: ['battery_service'] }
      ],
      optionalServices: [
        '00001800-0000-1000-8000-00805f9b34fb',
        '00001801-0000-1000-8000-00805f9b34fb',
        'battery_service'
      ]
    });

    document.getElementById('status').textContent = `Device found: ${device.name}`;
    console.log('Device:', device);

    const server = await device.gatt.connect();
    console.log('Connected to GATT server');

    const services = await server.getPrimaryServices();
    document.getElementById('services').innerHTML = '';
    for (const service of services) {
      await displayService(service);
    }
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('status').textContent = `Error: ${error.message}`;
  }
});

// 儲存隱藏服務列表
const hiddenServices = new Map();

// Service 和 Characteristic 的友好名稱映射
const serviceNameMap = {
  'e6ce8bf4-7ca9-496e-bb9c-eebba7e95374': 'Current & Power',
  '00001800-0000-1000-8000-00805f9b34fb': 'Generic Access',
  '00001801-0000-1000-8000-00805f9b34fb': 'Generic Attribute',
  'battery_service': 'Battery Service',
};

const characteristicNameMap = {
  '13ba4f0e-0dc0-4141-8a1e-ee3e70495394': 'Custom Characteristic',
  '2a00': 'Device Name',
  '2a01': 'Device Appearance',
};

// 顯示每個服務和其特徵值
async function displayService(service) {
  const serviceBlock = document.createElement('div');
  serviceBlock.classList.add('service-block');

  const serviceName = serviceNameMap[service.uuid] || `Service UUID: ${service.uuid}`;
  serviceBlock.innerHTML = `
    <strong>Service:</strong> ${serviceName} <span class="toggle-icon">▼</span>
  `;

  // 點擊服務名稱以摺疊/展開區塊
  serviceBlock.addEventListener('click', () => {
    const charDivs = serviceBlock.querySelectorAll('.characteristic');
    const icon = serviceBlock.querySelector('.toggle-icon');
    const isCollapsed = serviceBlock.classList.toggle('collapsed');

    icon.textContent = isCollapsed ? '►' : '▼';
    charDivs.forEach(charDiv => {
      charDiv.style.display = isCollapsed ? 'none' : 'block';
    });
  });

  const characteristics = await service.getCharacteristics();
  for (const characteristic of characteristics) {
    const charDiv = document.createElement('div');
    charDiv.classList.add('characteristic');
    charDiv.style.display = 'block';

    const characteristicName = characteristicNameMap[characteristic.uuid] || `Characteristic UUID: ${characteristic.uuid}`;
    charDiv.innerHTML = `
      <strong>${characteristicName}</strong><br>
      <strong>Properties:</strong> ${listProperties(characteristic.properties)}<br>
      <strong>Value:</strong> <span id="value-${characteristic.uuid}">Not Read</span><br>
    `;

    if (characteristic.properties.read) {
      // 單次讀取按鈕
      const readButton = document.createElement('button');
      readButton.textContent = 'Read Once';
      readButton.onclick = async (event) => {
        event.stopPropagation();
        try {
          await readCharacteristic(characteristic);
        } catch (error) {
          console.error('Read action failed:', error);
        }
      };
      charDiv.appendChild(readButton);

      // 連續讀取按鈕
      const continuousReadButton = document.createElement('button');
      continuousReadButton.textContent = 'Start Continuous Read';
      let continuousReadInterval;

      continuousReadButton.onclick = async (event) => {
        event.stopPropagation();
        if (continuousReadButton.textContent === 'Start Continuous Read') {
          continuousReadButton.textContent = 'Stop Continuous Read';
          continuousReadInterval = setInterval(async () => {
            try {
              await readCharacteristic(characteristic);
            } catch (error) {
              console.error('Continuous read failed:', error);
            }
          }, 500); // 每500ms讀取一次
        } else {
          continuousReadButton.textContent = 'Start Continuous Read';
          clearInterval(continuousReadInterval);
        }
      };
      charDiv.appendChild(continuousReadButton);
    }

    serviceBlock.appendChild(charDiv);
  }

  // 增加隱藏按鈕
  const hideButton = document.createElement('button');
  hideButton.textContent = 'Hide Service';
  hideButton.style.marginTop = '10px';
  hideButton.onclick = () => hideService(service.uuid, serviceName, serviceBlock);
  serviceBlock.appendChild(hideButton);

  document.getElementById('services').appendChild(serviceBlock);
}

// 隱藏服務
function hideService(uuid, name, serviceBlock) {
  hiddenServices.set(uuid, { name, element: serviceBlock });
  serviceBlock.remove();

  const hiddenList = document.getElementById('hidden-list');
  const hiddenItem = document.createElement('div');
  hiddenItem.classList.add('hidden-item');
  hiddenItem.innerHTML = `${name}`;
  const restoreButton = document.createElement('button');
  restoreButton.textContent = 'Restore';
  restoreButton.onclick = () => restoreService(uuid);
  hiddenItem.appendChild(restoreButton);

  hiddenList.appendChild(hiddenItem);
}

// 恢復隱藏服務
function restoreService(uuid) {
  if (hiddenServices.has(uuid)) {
    const { element } = hiddenServices.get(uuid);
    document.getElementById('services').appendChild(element);
    hiddenServices.delete(uuid);

    // 移除對應的隱藏條目
    const hiddenList = document.getElementById('hidden-list');
    hiddenList.innerHTML = '';
    hiddenServices.forEach(({ name }) => {
      const hiddenItem = document.createElement('div');
      hiddenItem.classList.add('hidden-item');
      hiddenItem.innerHTML = `${name}`;
      const restoreButton = document.createElement('button');
      restoreButton.textContent = 'Restore';
      restoreButton.onclick = () => restoreService(uuid);
      hiddenItem.appendChild(restoreButton);
      hiddenList.appendChild(hiddenItem);
    });
  }
}

function listProperties(properties) {
  return Object.keys(properties)
    .filter(key => properties[key])
    .join(', ');
}

async function readCharacteristic(characteristic) {
  try {
    console.log(`Reading characteristic: ${characteristic.uuid}`);
    const value = await characteristic.readValue();

    const hexValue = Array.from(new Uint8Array(value.buffer))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join(' ');

    const valueString = new TextDecoder('utf-8').decode(value);

    console.log(`Hex Value for ${characteristic.uuid}: ${hexValue}`);
    console.log(`Decoded Value for ${characteristic.uuid}:`, valueString);

    const readValueDiv = document.getElementById(`value-${characteristic.uuid}`);
    if (readValueDiv) {
      readValueDiv.innerHTML = `Hex Value: ${hexValue}<br>Decoded Value: ${valueString}`;
    }
  } catch (error) {
    console.error(`Error reading characteristic ${characteristic.uuid}:`, error);
  }
}
