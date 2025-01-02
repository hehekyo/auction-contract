import dotenv from 'dotenv';
import axios from 'axios';
dotenv.config();

interface PinataFile {
  id: string;
  ipfs_pin_hash: string;
  size: number;
  user_id: string;
  date_pinned: string;
  date_unpinned: string | null;
  metadata: {
    name: string;
    keyvalues: Record<string, string>;
  };
}

interface PinataResponse {
  count: number;
  rows: PinataFile[];
}

async function listPinataFiles() {
    try {
        const JWT = process.env.PINATA_JWT;
        if (!JWT) {
            throw new Error('PINATA_JWT not found in environment variables');
        }

        // Pinata API endpoint for querying pins
        const url = 'https://api.pinata.cloud/data/pinList';
        
        // Query parameters
        const params = {
            status: 'pinned',
            metadata: {
                name: 'nfts/', // 查找名称以 'nfts/' 开头的文件
                keyvalues: {
                    // 可以添加其他过滤条件
                }
            }
        };

        const response = await axios.get<PinataResponse>(url, {
            params,
            headers: {
                'Authorization': `Bearer ${JWT}`
            }
        });

        console.log('\n=== Files in nfts folder ===\n');
        
        response.data.rows.forEach(file => {
            console.log(`Name: ${file.metadata.name}`);
            console.log(`CID: ${file.ipfs_pin_hash}`);
            console.log(`Size: ${file.size} bytes`);
            console.log(`Pinned: ${new Date(file.date_pinned).toLocaleString()}`);
            console.log('-------------------');
        });

        console.log(`\nTotal files: ${response.data.count}`);

        // 返回所有 CID 的数组
        return response.data.rows.map(file => ({
            cid: file.ipfs_pin_hash,
            name: file.metadata.name,
            size: file.size,
            date: file.date_pinned
        }));

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Error fetching files:', error.response?.data || error.message);
        } else {
            console.error('Error:', error);
        }
        throw error;
    }
}

// 执行函数
listPinataFiles()
    .then(files => {
        // 将结果保存到文件
        const fs = require('fs');
        fs.writeFileSync(
            'pinata-files.json',
            JSON.stringify({ 
                timestamp: new Date().toISOString(),
                files 
            }, null, 2)
        );
        console.log('\nResults saved to pinata-files.json');
    })
    .catch(console.error);