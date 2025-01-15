import * as fs from "fs";
import * as path from "path";

// 定义源目录和目标目录
const artifactsPath = path.join(__dirname, "../../artifacts/contracts");
const abiOutputPath = path.join(__dirname, "../../abi");

// 创建目标目录
if (!fs.existsSync(abiOutputPath)) {
    fs.mkdirSync(abiOutputPath, { recursive: true });
}

// 遍历所有合约文件夹并提取 ABI
function extractAndSaveAbi(): void {
    const contracts = fs.readdirSync(artifactsPath);

    contracts.forEach((contractFolder) => {
        const contractPath = path.join(artifactsPath, contractFolder);

        if (fs.lstatSync(contractPath).isDirectory()) {
            const files = fs.readdirSync(contractPath);

            files.forEach((file) => {
                if (file.endsWith(".json")) {
                    const artifact = JSON.parse(fs.readFileSync(path.join(contractPath, file), "utf-8"));
                    if (artifact.abi) {
                        const outputFilePath = path.join(abiOutputPath, `${file.replace(".json", ".abi.json")}`);
                        fs.writeFileSync(outputFilePath, JSON.stringify(artifact.abi, null, 2));
                        console.log(`ABI exported: ${outputFilePath}`);
                    }
                }
            });
        }
    });
}

// 执行导出
extractAndSaveAbi();
