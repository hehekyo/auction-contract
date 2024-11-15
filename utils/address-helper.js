const fs = require('fs');
const path = require('path');

// 地址文件路径
const ADDRESS_FILE = path.join(__dirname, '../deployed-addresses.json');

// 保存部署地址
function saveDeployedAddresses(addresses) {
    fs.writeFileSync(
        ADDRESS_FILE,
        JSON.stringify(addresses, null, 2)
    );
    console.log('部署地址已保存到:', ADDRESS_FILE);
}

// 读取部署地址
function getDeployedAddresses() {
    if (!fs.existsSync(ADDRESS_FILE)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(ADDRESS_FILE, 'utf8'));
}

module.exports = {
    saveDeployedAddresses,
    getDeployedAddresses
}; 