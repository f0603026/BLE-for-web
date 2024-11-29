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

// Service and Characteristic mappings for friendly names
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

// Display each service and its characteristics
async function displayService(service) {
  const serviceBlock = document.createElement('div');
  serviceBlock.classList.add('service-block');
  
  // Check if there is a friendly name for the service
  const serviceName = serviceNameMap[service.uuid] || `Service UUID: ${service.uuid}`;
  serviceBlock.innerHTML = `<strong>Service:</strong> ${serviceName}`;

  try {
    const characteristics = await service.getCharacteristics();
    for (const characteristic of characteristics) {
      const charDiv = document.createElement('div');
      charDiv.classList.add('characteristic');
      
      // Check if there is a friendly name for the characteristic
      const characteristicName = characteristicNameMap[characteristic.uuid] || `Characteristic UUID: ${characteristic.uuid}`;
      
      charDiv.innerHTML = `
        <strong>${characteristicName}</strong><br>
        <strong>Properties:</strong> ${listProperties(characteristic.properties)}<br>
        <strong>Value:</strong> <span id="value-${characteristic.uuid}">Not Read</span><br>
      `;

      if (characteristic.properties.read) {
        const readButton = document.createElement('button');
        readButton.textContent = 'Read';
        readButton.onclick = async () => {
          try {
            await readCharacteristic(characteristic); // 读取特性值
          } catch (error) {
            console.error('Read action failed:', error);
          }
        };
        charDiv.appendChild(readButton);

        // 自动每0.5秒读取一次值
        setInterval(async () => {
          await readCharacteristic(characteristic);
        }, 500); // 每500ms自动读取一次
      }

      try {
        const descriptors = await characteristic.getDescriptors();
        if (descriptors.length > 0) {
          const descList = document.createElement('ul');
          descList.innerHTML = '<strong>Descriptors:</strong>';
          for (const descriptor of descriptors) {
            const descValue = await descriptor.readValue();
            const valueString = new TextDecoder().decode(descValue);
            const descItem = document.createElement('li');
            descItem.textContent = `${formatUUID(descriptor.uuid)}: ${valueString || 'No Value'}`;
            descList.appendChild(descItem);
          }
          charDiv.appendChild(descList);
        }
      } catch (error) {
        console.log('No descriptors found for this characteristic:', error);
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
    console.log(`Decoded Value for ${characteristic.uuid}: ${valueString}`);

    // Update the page with the hex and decoded values
    const readValueDiv = document.getElementById(`value-${characteristic.uuid}`);
    if (readValueDiv) {
      readValueDiv.textContent = `Hex Value: ${hexValue} | Decoded Value: ${valueString}`;
    }
  } catch (error) {
    console.error(`Error reading characteristic ${characteristic.uuid}:`, error);
  }
}

