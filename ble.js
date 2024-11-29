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

    // 顯示 MAC Address
    const base64Address = device.id; // 獲取設備 ID (Base64 格式)
    const macHex = base64ToMac(base64Address); // 轉換為 MAC 格式
    const macElement = document.getElementById('mac-address'); // 檢查是否已有 MAC Address
    if (!macElement) {
      const newMacElement = document.createElement('p');
      newMacElement.id = 'mac-address';
      newMacElement.textContent = `MAC Address: ${macHex}`;
      document.querySelector('.controls').appendChild(newMacElement);
    } else {
      macElement.textContent = `MAC Address: ${macHex}`; // 更新內容
    }

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

// Base64 轉標準 MAC 格式函數
function base64ToMac(base64) {
  const binaryString = atob(base64); // 解碼 Base64
  const hexArray = Array.from(binaryString)
    .slice(0, 6) // 只保留前 6 個字節 (MAC 地址)
    .map(byte => byte.charCodeAt(0).toString(16).padStart(2, '0')); // 每個字節轉 HEX
  return hexArray.join(':').toUpperCase(); // 用 ":" 分隔，轉大寫
}

// Service and Characteristic mappings for friendly names
const serviceNameMap = {
  'e6ce8bf4-7ca9-496e-bb9c-eebba7e95374': 'Current & Power',
  '00001800-0000-1000-8000-00805f9b34fb': 'Generic Access',
  '00001801-0000-1000-8000-00805f9b34fb': 'Generic Attribute',
  '0000180a-0000-1000-8000-00805f9b34fb': 'Device Access',
  'battery_service': 'Battery Service',
};

const characteristicNameMap = {
  '13ba4f0e-0dc0-4141-8a1e-ee3e70495394': 'Custom Characteristic',
  '2a00': 'Device Name',
  '2a01': 'Device Appearance',
};

// Display each service and its characteristics
async function displayService(service) {
  // 清單：包含需要隱藏的 Service UUID
  const hiddenServices = [
    '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
    '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute
    '0000180a-0000-1000-8000-00805f9b34fb', // Device Access
  ];

  // 檢查是否需要隱藏該服務
  if (hiddenServices.includes(service.uuid)) {
    console.log(`Hiding service: ${service.uuid}`);
    return; // 不渲染該服務
  }

  const serviceBlock = document.createElement('div');
  serviceBlock.classList.add('service-block');

  // 檢查是否有友好的 Service 名稱
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

  try {
    const characteristics = await service.getCharacteristics();
    for (const characteristic of characteristics) {
      const charDiv = document.createElement('div');
      charDiv.classList.add('characteristic');
      charDiv.style.display = 'block'; // 初始狀態顯示

      // 檢查是否有友好的 Characteristic 名稱
      const characteristicName = characteristicNameMap[characteristic.uuid] || `Characteristic UUID: ${characteristic.uuid}`;
      
      charDiv.innerHTML = `
        <strong>${characteristicName}</strong><br>
        <strong>Properties:</strong> ${listProperties(characteristic.properties)}<br>
        <strong>Value:</strong> <span id="value-${characteristic.uuid}">Not Read</span><br>
      `;

      if (characteristic.properties.read) {
        const readButton = document.createElement('button');
        readButton.textContent = 'Read';
        readButton.onclick = async (event) => {
          event.stopPropagation(); // 防止按鈕點擊觸發摺疊/展開
          try {
            await readCharacteristic(characteristic); // 讀取特性值
          } catch (error) {
            console.error('Read action failed:', error);
          }
        };
        charDiv.appendChild(readButton);

        // 添加自動讀取功能，每 500 毫秒讀取一次值
        setInterval(async () => {
          try {
            await readCharacteristic(characteristic);
          } catch (error) {
            console.error(`Auto-read failed for ${characteristic.uuid}:`, error);
          }
        }, 500); // 每 500 毫秒讀取一次
      }

      serviceBlock.appendChild(charDiv);
    }
  } catch (error) {
    console.error(`Error processing service ${service.uuid}:`, error);
  }

  document.getElementById('services').appendChild(serviceBlock);
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

    // Convert to Hex representation
    const hexValue = Array.from(new Uint8Array(value.buffer))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join(' ');

    // Attempt to decode as UTF-8 string
    let valueString = '';
    try {
      valueString = new TextDecoder('utf-8').decode(value);
    } catch (e) {
      // If decoding fails, fall back to Hex
      valueString = `(Cannot decode as UTF-8, displaying Hex: ${hexValue})`;
    }

    console.log(`Hex Value for ${characteristic.uuid}: ${hexValue}`);
    console.log(`Decoded Value for ${characteristic.uuid}:`, valueString);

    // 分割出 "A" 和 "W" 放到不同的行
    const decodedValues = valueString.split(',').map(value => value.trim());

    // 更新頁面
    const readValueDiv = document.getElementById(`value-${characteristic.uuid}`);
    if (readValueDiv) {
      readValueDiv.innerHTML = `Hex Value: ${hexValue}<br>
        <strong>Decoded Value:</strong><br>
        <div style="font-size: 20px; background-color: #ffffff; color: #000000; padding: 10px; border: 2px solid #000000; border-radius: 5px; display: flex; justify-content: center; align-items: center; text-align: center; width: auto; height: auto;">
          ${decodedValues[0]}<br>
          ${decodedValues[1]}
        </div>`;
    }

    // 更新 HEX 区块的内容
    const hexDiv = document.getElementById(`hex-${characteristic.uuid}`);
    if (hexDiv) {
      hexDiv.textContent = `Hex Value: ${hexValue}`;
    }

  } catch (error) {
    console.error(`Error reading characteristic ${characteristic.uuid}:`, error);
  }
}






