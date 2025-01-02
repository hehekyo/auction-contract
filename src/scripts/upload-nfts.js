import axios from 'axios';
import FormData from 'form-data';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pinata API configuration
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    console.error('Please set PINATA_API_KEY and PINATA_SECRET_KEY environment variables');
    process.exit(1);
}

// Pinata API endpoints
const PINATA_API = {
    pinFileToIPFS: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
    pinJSONToIPFS: 'https://api.pinata.cloud/pinning/pinJSONToIPFS'
};

// Headers for Pinata API
const headers = {
    pinata_api_key: PINATA_API_KEY,
    pinata_secret_api_key: PINATA_SECRET_KEY
};

// Helper function to upload file to IPFS via Pinata
async function uploadToPinata(filePath, name) {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));
        
        // Add metadata
        const metadata = JSON.stringify({
            name: name,
            keyvalues: {
                date: new Date().toISOString()
            }
        });
        formData.append('pinataMetadata', metadata);

        const response = await axios.post(PINATA_API.pinFileToIPFS, formData, {
            headers: {
                ...headers,
                'Content-Type': `multipart/form-data; boundary=${formData._boundary}`
            },
            maxBodyLength: Infinity
        });

        return `ipfs://${response.data.IpfsHash}`;
    } catch (error) {
        console.error('Error uploading to Pinata:', error.response?.data || error.message);
        throw error;
    }
}

// Helper function to upload metadata to IPFS
async function uploadMetadataToPinata(metadata, name) {
    try {
        const response = await axios.post(PINATA_API.pinJSONToIPFS, 
            {
                ...metadata,
                pinataMetadata: { name }
            },
            { headers }
        );

        return `ipfs://${response.data.IpfsHash}`;
    } catch (error) {
        console.error('Error uploading metadata to Pinata:', error.response?.data || error.message);
        throw error;
    }
}

async function uploadNFTs() {
    try {
        // Path to NFT images directory
        const imagesDir = path.join(__dirname, '../assets/nfts');
        
        // Check if directory exists
        if (!fs.existsSync(imagesDir)) {
            console.error('NFT images directory not found');
            process.exit(1);
        }

        console.log('\n=== Starting NFT Upload Process ===\n');
        
        // Get all image files
        const imageFiles = fs.readdirSync(imagesDir)
            .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));

        console.log(`Found ${imageFiles.length} image files\n`);

        // Store metadata URLs
        const metadataUrls = [];

        // Upload each NFT
        for (let i = 0; i < imageFiles.length; i++) {
            const imageFile = imageFiles[i];
            console.log(`\nProcessing ${imageFile} (${i + 1}/${imageFiles.length})`);

            const imagePath = path.join(imagesDir, imageFile);
            const nftName = `NFT #${i + 1}`;
            
            // Upload image
            console.log('Uploading image to Pinata...');
            const imageUrl = await uploadToPinata(imagePath, `${nftName} Image`);
            console.log('Image uploaded:', imageUrl);

            // Create and upload metadata
            console.log('Creating and uploading metadata...');
            const metadata = {
                name: nftName,
                description: `Description for ${nftName}`,
                image: imageUrl,
                attributes: [] // Add attributes if needed
            };

            const metadataUrl = await uploadMetadataToPinata(metadata, `${nftName} Metadata`);
            console.log('Metadata uploaded:', metadataUrl);
            
            // Store metadata URL
            metadataUrls.push({
                tokenId: i + 1,
                name: nftName,
                metadataUrl: metadataUrl,
                imageUrl: imageUrl
            });

            console.log('-------------------');
        }

        // Save metadata URLs to file
        const outputPath = path.join(__dirname, '../nft-metadata.json');
        fs.writeFileSync(
            outputPath, 
            JSON.stringify({ 
                totalNFTs: metadataUrls.length,
                uploadedAt: new Date().toISOString(),
                nfts: metadataUrls 
            }, null, 2)
        );

        console.log('\n=== Upload Process Complete ===');
        console.log(`Total NFTs processed: ${metadataUrls.length}`);
        console.log(`Metadata information saved to: ${outputPath}`);

    } catch (error) {
        console.error('Error during upload:', error);
        process.exit(1);
    }
}

// Execute the upload
uploadNFTs()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    }); 