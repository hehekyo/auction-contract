const fs = require('fs');
const path = require('path');

const ADDRESS_FILE = path.join(__dirname, '../deployed-addresses.json');

function saveDeployedAddresses(addresses) {
    fs.writeFileSync(
        ADDRESS_FILE,
        JSON.stringify(addresses, null, 2)
    );
    console.log('部署地址已保存到:', ADDRESS_FILE);
}

function getDeployedAddresses() {
    if (!fs.existsSync(ADDRESS_FILE)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(ADDRESS_FILE, 'utf8'));
}

// 改用 module.exports 导出
module.exports = {
    saveDeployedAddresses,
    getDeployedAddresses
}; 