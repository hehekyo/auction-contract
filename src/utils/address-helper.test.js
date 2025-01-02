import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { saveDeployedAddresses, getDeployedAddresses } from './address-helper';

describe('地址助手测试', () => {
    const TEST_ADDRESSES = {
        MyNFT: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
        MyToken: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        AuctionManager: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
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