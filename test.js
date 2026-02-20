import { Catbox } from 'node-catbox';
const catbox = new Catbox();
try {

	const response = await catbox.uploadURL({
		url: 'https://i.imgur.com/8rR6IZn.png'
	});

	console.log(response); // -> https://files.catbox.moe/XXXXX.ext
} catch (err) {
	console.error(err); // -> error message from server
}