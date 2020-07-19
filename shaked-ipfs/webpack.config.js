const path = require("path");


module.exports = {
	mode: "production",
	target: "node",

	entry: {
		main: "./src/index.js"
	},

	output: {
		path: path.resolve(__dirname, "dist"),
		filename: "main.js",
		library: "shaked-ipfs",
		libraryTarget: "umd"
	}
};