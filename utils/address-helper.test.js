const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const { saveDeployedAddresses, getDeployedAddresses } = require('./address-helper');

describe('地址助手测试', () => {
    const TEST_ADDRESSES = {
        MyNFT: '0x1234567890123456789012345678901234567890',
        MyToken: '0x0987654321098765432109876543210987654321',
        AuctionManager: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    };

    // 每个测试后清理文件
    afterEach(() => {
        const addressFile = path.join(__dirname, '../deployed-addresses.json');
        if (fs.existsSync(addressFile)) {
            fs.unlinkSync(addressFile);
        }
    });

    it('应该能够保存地址', () => {
        saveDeployedAddresses(TEST_ADDRESSES);
        const addressFile = path.join(__dirname, '../deployed-addresses.json');
        expect(fs.existsSync(addressFile)).to.be.true;
        
        const savedAddresses = JSON.parse(fs.readFileSync(addressFile, 'utf8'));
        expect(savedAddresses).to.deep.equal(TEST_ADDRESSES);
    });

    it('应该能够读取保存的地址', () => {
        saveDeployedAddresses(TEST_ADDRESSES);
        const addresses = getDeployedAddresses();
        expect(addresses).to.deep.equal(TEST_ADDRESSES);
    });

    it('如果文件不存在应该返回空对象', () => {
        const addresses = getDeployedAddresses();
        expect(addresses).to.deep.equal({});
    });

    it('应该能够处理部分地址更新', () => {
        // 首先保存完整地址
        saveDeployedAddresses(TEST_ADDRESSES);
        
        // 更新部分地址
        const partialUpdate = {
            MyNFT: '0xnewaddress',
            MyToken: '0xnewtoken'
        };
        
        saveDeployedAddresses({
            ...getDeployedAddresses(),
            ...partialUpdate
        });

        const updatedAddresses = getDeployedAddresses();
        expect(updatedAddresses.MyNFT).to.equal(partialUpdate.MyNFT);
        expect(updatedAddresses.MyToken).to.equal(partialUpdate.MyToken);
        expect(updatedAddresses.AuctionManager).to.equal(TEST_ADDRESSES.AuctionManager);
    });
}); 