#!/usr/bin/env bun

import sharp from "sharp";
import inquirer from "inquirer";
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";

const log = console.log;

/**
 * A robust, truly recursive function to walk a directory and return all file paths.
 * This version uses fs.stat for maximum compatibility.
 * @param {string} dir - The directory to walk.
 * @returns {Promise<string[]>} A promise that resolves to an array of full file paths.
 */
const walkDir = async (dir) => {
	let files = [];
	const items = await fs.readdir(dir); // Get all item names in the directory

	for (const item of items) {
		const fullPath = path.join(dir, item);
		try {
			const stat = await fs.stat(fullPath); // Get stats for the item
			if (stat.isDirectory()) {
				// It's a directory, so we recurse into it and concatenate the results
				const nestedFiles = await walkDir(fullPath);
				files = files.concat(nestedFiles);
			} else {
				// It's a file, so we add its path to our list
				files.push(fullPath);
			}
		} catch (err) {
			// Log an error if a file/directory can't be read, but continue
			log(chalk.red(`Could not read path ${fullPath}: ${err.message}`));
		}
	}
	return files;
};

const run = async () => {
	log(chalk.bold.cyan("--- Kolibri Web Designs Global Image Processor (Recursive) ---"));

	const answers = await inquirer.prompt([
		{
			type: "input",
			name: "inputDir",
			message: "Enter the input directory relative to your current location:",
			default: "images",
			validate: (value) => {
				const dirPath = path.resolve(process.cwd(), value);
				return fs.existsSync(dirPath)
					? true
					: `Directory '${dirPath}' does not exist.`;
			},
		},
		{
			type: "input",
			name: "outputDir",
			message: "Enter the output directory relative to your current location:",
			default: "compressed-images",
		},
		{
			type: "list",
			name: "format",
			message: "Choose the output format:",
			choices: ["original", "webp", "avif"],
			default: "original",
		},
		{
			type: "number",
			name: "quality",
			message: "Enter the image quality (1-100):",
			default: 80,
			validate: (value) => (value > 0 && value <= 100 ? true : "Please enter a number between 1 and 100."),
		},
	]);

	const { format, quality } = answers;
	const inputPath = path.resolve(process.cwd(), answers.inputDir);
	const outputPath = path.resolve(process.cwd(), answers.outputDir);

	try {
		log(chalk.blue("Scanning for all files recursively..."));
		const allFiles = await walkDir(inputPath);

		// --- THIS IS THE CRITICAL FIX ---
		// The regex now includes 'avif' as a valid INPUT format.
		const imageFiles = allFiles.filter((file) =>
			/\.(jpe?g|png|webp|avif|tiff|gif)$/i.test(file),
		);

		if (imageFiles.length === 0) {
			log(chalk.yellow("No images found to process in the input directory."));
			return;
		}

		log(chalk.blue(`Found ${imageFiles.length} images. Starting processing...`));

		for (const inputFile of imageFiles) {
			// This logic remains the same and is correct
			const relativePath = path.relative(inputPath, inputFile);
			const outputSubDir = path.dirname(relativePath);
			const finalOutputDir = path.join(outputPath, outputSubDir);

			await fs.ensureDir(finalOutputDir);

			const baseName = path.basename(inputFile, path.extname(inputFile));
			const outputExt = format === "original" ? path.extname(inputFile) : `.${format}`;
			const outputFile = path.join(finalOutputDir, `${baseName}${outputExt}`);

			// Skip processing if input and output are the same file
			if (path.resolve(inputFile) === path.resolve(outputFile)) {
				log(chalk.yellow(`Skipping ${relativePath} as output path is the same.`));
				continue;
			}

			log(chalk.gray(`Processing ${relativePath}...`));

			try {
				const inputStats = await fs.stat(inputFile);
				const sharpInstance = sharp(inputFile);

				if (format === "webp") {
					await sharpInstance.webp({ quality }).toFile(outputFile);
				} else if (format === "avif") {
					await sharpInstance.avif({ quality }).toFile(outputFile);
				} else {
					const ext = path.extname(inputFile).toLowerCase();
					if (ext === ".jpeg" || ext === ".jpg") {
						await sharpInstance.jpeg({ quality, progressive: true }).toFile(outputFile);
					} else if (ext === ".png") {
						await sharpInstance.png({ quality, compressionLevel: 9 }).toFile(outputFile);
					} else {
						await fs.copy(inputFile, outputFile);
						log(chalk.yellow(`Copied ${relativePath} without re-compressing.`));
						continue;
					}
				}

				const outputStats = await fs.stat(outputFile);
				const reduction = ((inputStats.size - outputStats.size) / inputStats.size) * 100;

				log(
					chalk.green(
						`✓ Saved to ${path.relative(process.cwd(), outputFile)} | ${Math.round(
							inputStats.size / 1024,
						)}KB -> ${Math.round(
							outputStats.size / 1024,
						)}KB | Reduction: ${reduction.toFixed(2)}%`,
					),
				);
			} catch (err) {
				log(chalk.red(`✗ Failed to process ${relativePath}: ${err.message}`));
			}
		}

		log(chalk.bold.cyan(`\n🎉 Finished! Processed ${imageFiles.length} images successfully.`));
	} catch (error) {
		log(chalk.red("A critical error occurred:"));
		log(chalk.red(error));
	}
};

run();