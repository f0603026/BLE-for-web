// 排除的服務 UUID 清單
const excludedServiceUUIDs = [
  '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
  '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute
];

// Service 和 Characteristic 的友好名稱映射
const serviceNameMap = {
  'e6ce8bf4-7ca9-496e-bb9c-eebba7e95374': 'Power Consumption',
  '7638f1cb-8618-4a3e-9822-150e733735e3': 'GPIO Set',
  '00001800-0000-1000-8000-00805f9b34fb': 'Generic Access',
  '00001801-0000-1000-8000-00805f9b34fb': 'Generic Attribute',
  'battery_service': 'Battery Service',
};

// 開始掃描並顯示可用的服務
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
        'e6ce8bf4-7ca9-496e-bb9c-eebba7e95374', // Current
        '7638f1cb-8618-4a3e-9822-150e733735e3', // GPIO set
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
      // 排除不需要的服務
      if (excludedServiceUUIDs.includes(service.uuid)) {
        continue; // Skip the excluded service
      }
      await displayService(service);
    }
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('status').textContent = `Error: ${error.message}`;
  }
});

// 顯示每個服務和特徵值
async function displayService(service) {
  const serviceBlock = document.createElement('div');
  serviceBlock.classList.add('service-block');

  // 顯示服務名稱
  const serviceName = serviceNameMap[service.uuid] || `Service UUID: ${service.uuid}`;
  serviceBlock.innerHTML = `<strong>${serviceName}</strong>`;

  const characteristics = await service.getCharacteristics();

  for (const characteristic of characteristics) {
    const charDiv = document.createElement('div');
    charDiv.classList.add('characteristic');

    // 如果是 GPIO Set 特徵值，加入控制按鈕
    if (service.uuid === '7638f1cb-8618-4a3e-9822-150e733735e3') {
      const gpioContainer = document.createElement('div');
      gpioContainer.classList.add('gpio-buttons');

      for (let i = 0; i <= 6; i++) {
        const gpioButton = document.createElement('button');
        gpioButton.textContent = i;
        gpioButton.onclick = async () => {
          try {
            const buffer = new Uint8Array([i]).buffer;
            await characteristic.writeValue(buffer);
            console.log(`Wrote GPIO value: ${i}`);
          } catch (error) {
            console.error(`Failed to write GPIO value: ${i}`, error);
          }
        };
        gpioContainer.appendChild(gpioButton);
      }

      charDiv.appendChild(gpioContainer);
    } else {
      // 對於非 GPIO Set 的特徵值，添加解碼數據框
      const decodedValueDiv = document.createElement('div');
      decodedValueDiv.classList.add('decoded-value-box');
      decodedValueDiv.id = `decoded-value-${characteristic.uuid}`;
      decodedValueDiv.textContent = 'N/A';
      charDiv.appendChild(decodedValueDiv);

      // 添加讀取數據的按鈕，放在解碼數據框的下方
      if (characteristic.properties.read) {
        let intervalId = null;

        const buttonContainer = document.createElement('div');
        buttonContainer.classList.add('button-container'); // 新增一個容器來包裝按鈕，方便樣式調整

        const readOnceButton = document.createElement('button');
        readOnceButton.textContent = 'Read Once';
        readOnceButton.className = 'read-once';
        readOnceButton.onclick = async () => {
          await readCharacteristic(characteristic);
        };

        const continuousReadButton = document.createElement('button');
        continuousReadButton.textContent = 'Start Continuous Read';
        continuousReadButton.className = 'continuous-read';
        continuousReadButton.onclick = () => {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            continuousReadButton.textContent = 'Start Continuous Read';
            continuousReadButton.className = 'continuous-read';
          } else {
            intervalId = setInterval(async () => {
              await readCharacteristic(characteristic);
            }, 500);
            continuousReadButton.textContent = 'Stop Continuous Read';
            continuousReadButton.className = 'stop-read';
          }
        };

        buttonContainer.appendChild(readOnceButton);
        buttonContainer.appendChild(continuousReadButton);

        // 將按鈕容器插入到解碼數據框的下方
        charDiv.appendChild(buttonContainer);
      }
    }

    serviceBlock.appendChild(charDiv);
  }

  document.getElementById('services').appendChild(serviceBlock);
}




async function readCharacteristic(characteristic) {
  try {
    console.log(`Reading characteristic: ${characteristic.uuid}`);
    const value = await characteristic.readValue();

    // 檢查數據是否有效
    if (!value || value.byteLength === 0) {
      console.warn(`Characteristic ${characteristic.uuid} returned no data.`);
      const decodedValueDiv = document.getElementById(`decoded-value-${characteristic.uuid}`);
      decodedValueDiv.style.fontStyle = 'italic'; // 對空數據使用斜體
      decodedValueDiv.textContent = 'No Data';
      return;
    }

    // 嘗試以不同格式解碼數據
    let decodedString = '';
    try {
      // 首先嘗試以 UTF-8 解碼
      decodedString = new TextDecoder('utf-8').decode(value);
    } catch (e) {
      console.warn(`UTF-8 decoding failed for ${characteristic.uuid}: ${e}`);
    }

    if (!decodedString || /[\uFFFD]/.test(decodedString)) {
      // 如果 UTF-8 解碼結果是亂碼或不可顯示，回退為十六進制
      decodedString = Array.from(new Uint8Array(value.buffer))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join(' ');
    }

    console.log(`Decoded Value for ${characteristic.uuid}: ${decodedString}`);

    // 將解碼後的數據顯示在網頁上，並調整樣式
    const decodedValueDiv = document.getElementById(`decoded-value-${characteristic.uuid}`);
    if (decodedString === 'N/A') {
      decodedValueDiv.style.fontStyle = 'italic'; // 對空數據使用斜體
    } else {
      decodedValueDiv.style.fontStyle = 'normal'; // 對有效數據取消斜體
    }
    decodedValueDiv.textContent = `Value: ${decodedString}`;
  } catch (error) {
    console.error(`Error reading characteristic ${characteristic.uuid}:`, error);
    const decodedValueDiv = document.getElementById(`decoded-value-${characteristic.uuid}`);
    decodedValueDiv.style.fontStyle = 'italic'; // 如果出現錯誤，使用斜體
    decodedValueDiv.textContent = `Error: ${error.message}`;
  }
}





// 解碼 Current & Power 服務的數值，轉換為所需的格式
function decodeCurrentAndPowerValue(value) {
  const dataView = new DataView(value.buffer);

  // 假設數值在前兩個字節：電流和功率
  const current = dataView.getUint8(0);   // 假設電流在第一個字節
  const power = dataView.getUint8(1);     // 假設功率在第二個字節

  // 假設將電流數值轉換為浮點數並顯示
  const currentFormatted = (current / 1000).toFixed(3);  // 假設電流是以毫安（mA）表示，轉換為安培（A）
  const powerFormatted = (power / 100).toFixed(3);       // 假設功率是以毫瓦（mW）表示，轉換為瓦特（W）

  // 返回解碼後的數值格式
  return `${currentFormatted} A, ${powerFormatted} W`;
}

// 讀取 GPIO 設置並顯示
async function readGPIOValue(characteristic) {
  try {
    // 讀取特徵值數據
    const value = await characteristic.readValue();
    
    // 確認數據有效性
    if (!value || value.byteLength === 0) {
      console.error(`Characteristic ${characteristic.uuid} returned no data.`);
      document.getElementById('gpio-value-display').textContent = 'No Data';
      return;
    }

    // 將數據轉為 Uint8Array，方便處理每個字節
    const uint8Array = new Uint8Array(value.buffer);

    // 如果是單字節數據
    if (uint8Array.length === 1) {
      const uint8Value = uint8Array[0];
      console.log(`GPIO Value: ${uint8Value}`);
      document.getElementById('gpio-value-display').textContent = uint8Value;
    } else {
      // 如果是多字節數據，顯示為十六進制
      const hexValue = Array.from(uint8Array)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join(' ');
      console.log(`GPIO Value (Hex): ${hexValue}`);
      document.getElementById('gpio-value-display').textContent = hexValue;
    }
  } catch (error) {
    console.error(`Failed to read GPIO value from ${characteristic.uuid}:`, error);
    document.getElementById('gpio-value-display').textContent = 'Error';
  }
}
