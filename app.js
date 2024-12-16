require('dotenv').config();
path = require("path")
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const bodyParser = require("body-parser");
const Note = require('./models/Note');

const app = express();

app.set("views", path.join(__dirname, "views"));
app.set('view engine', 'ejs');



app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.use(bodyParser.urlencoded({
    extended: true
}));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected')).catch(err => console.error(err));

// Define constants
const algorithm = 'aes-256-ctr';
const secretKey = process.env.SECRET_KEY;
if (!secretKey || secretKey.length !== 32) {
    throw new Error("SECRET_KEY must be a 32-byte string.");
}

// Helper function to encrypt notes
function encrypt(text) {
    const iv = crypto.randomBytes(16); // Generate a random initialization vector
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`; // Concatenate IV and encrypted text
}

// Helper function to decrypt notes
function decrypt(encryptedText) {
    const [iv, encrypted] = encryptedText.split(':'); // Separate IV and encrypted text
    if (!iv || !encrypted) {
        throw new Error("Invalid encrypted text format.");
    }
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}


app.get('/', (req, res) => {
    header_data = {
        meta_title: 'Temp Note - Send notes that will self-destruct after being read',
    }

    data = {
        header_data: header_data,
        footer_data: {}
    }
    res.render('user/home/index', data)
});

app.post('/note/create', async (req, res) => {
    const {
        note,
        duration_hours,
        password,
        readOnce
    } = req.body;

    const encryptedNote = encrypt(note);
    const encryptedPassword = password ? encrypt(password) : null;

    // const expiryDate = duration_hours ? new Date(Date.now() + duration_hours * 60 * 60 * 1000) : null;
    const expiryDate = duration_hours == 0 ? null : new Date(Date.now() + duration_hours * 60 * 60 * 1000);

    const notePayload = new Note({
        content: encryptedNote,
        expiryDate,
        password: encryptedPassword,
        readOnce: readOnce === 'true', // Convert the string value to boolean
    });

    try {
        await notePayload.save();
        res.status(201).json({
            status: 200,
            message: 'Note created',
            data: {
                noteId: notePayload.shortlink,
                note_link: `${req.protocol}://${req.get('host')}/note/${notePayload.shortlink}`
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: 'Failed to create note'
        });
    }
});

app.get('/note/:shortlink', async (req, res) => {
    shortLink = req.params.shortlink;
    const noteData = await Note.findOne({
        shortlink: shortLink
    });

    header_data = {
        meta_title: 'Temp Note - Send notes that will self-destruct after being read',
    }

    console.log(noteData);


    if (!noteData) {
        //render 404 page
        data = {
            header_data: header_data,
            footer_data: {},
            data: {
                errorMessage: 'Note not found',
                errorDescription: 'Note not found on the server',
            }
        }
        return res.status(404).render('user/home/error', data);
    }

    //check if note is expired
    if (noteData.expiryDate && new Date() > new Date(noteData.expiryDate)) {
        //delete note and render expired page
        await Note.deleteOne({
            shortlink: shortLink
        });

        data = {
            header_data: header_data,
            footer_data: {},
            data: {
                errorMessage: 'Note has expired',
                errorDescription: 'Note has expired and has been deleted from the server',
            }
        }
        return res.status(404).render('user/home/error', data);
    }

    //check if note has been read
    if (noteData.readStatus) {
        if (noteData.readOnce) {
            //delete note and render expired page
            await Note.deleteOne({
                shortlink: shortLink
            });

            data = {
                header_data: header_data,
                footer_data: {},
                data: {
                    errorMessage: 'Note has been already read',
                    errorDescription: 'Note has been already read and has been deleted from the server',
                }
            }

            return res.status(404).render('user/home/error', data);
        } else {
            // Check if expiryDate is not set
            if (noteData.expiryDate == null) {

                // Delete the note if it has been read and no expiryDate is set
                await Note.deleteOne({
                    shortlink: shortLink
                });

                data = {
                    header_data: header_data,
                    footer_data: {},
                    data: {
                        errorMessage: 'Note has been already read',
                        errorDescription: 'Note has been already read and has been deleted from the server',
                    }
                };
                return res.status(404).render('user/home/error', data);
            }
        }
    }

    const passwordRequired = noteData.password ? true : false;

    data = {
        header_data: header_data,
        footer_data: {},
        data: {
            noteId: noteData.shortlink,
            passwordRequired: passwordRequired
        }
    }


    //render note page
    res.render('user/home/note', data);
});

app.post('/note/read/:shortlink', async (req, res) => {
    const shortLink = req.params.shortlink;
    const password = req.body.password; // Get the password from the request body

    try {
        const noteData = await Note.findOne({ shortlink: shortLink });

        if (!noteData) {
            return res.status(404).json({
                status: 404,
                errorMessage: 'Note not found',
                errorDescription: 'Note not found on the server',
            });
        }

        // Check if the note is expired
        if (noteData.expiryDate && new Date() > new Date(noteData.expiryDate)) {
            await Note.deleteOne({ shortlink: shortLink });
            return res.status(404).json({
                status: 404,
                errorMessage: 'Note has expired',
                errorDescription: 'Note has expired and has been deleted from the server',
            });
        }

        // Check if the note has been read and readOnce is true
        if (noteData.readStatus) {
            // Check if the note has an expiryDate and readOnce is true
            if (noteData.expiryDate && noteData.readOnce) {
                await Note.deleteOne({ shortlink: shortLink });
                return res.status(404).json({
                    status: 404,
                    errorMessage: 'Note has been already read',
                    errorDescription: 'Note has been already read and has been deleted from the server',
                });
            }
        }

        // Check if the note does not have an expiryDate and readOnce is false
        if (!noteData.expiryDate && !noteData.readOnce) {
            if(noteData.readStatus){
                await Note.deleteOne({ shortlink: shortLink });
                return res.status(404).json({
                    status: 404,
                    errorMessage: 'Note has been already read',
                    errorDescription: 'Note has been already read and has been deleted from the server',
                });
            }
        }


        // Check if the note is password protected
        if (noteData.password) {
            if (!password || password !== decrypt(noteData.password)) {
                return res.status(401).json({
                    status: 401,
                    errorMessage: 'Incorrect password',
                    errorDescription: 'The password you entered is incorrect.',
                });
            }
        }

        // Decrypt the note content
        const decryptedNote = decrypt(noteData.content);

        // Update read status
        noteData.readStatus = true;
        await noteData.save();

        // Delete the note if readOnce is true
        if (noteData.readOnce) {
            await Note.deleteOne({ shortlink: shortLink });
        }

        return res.status(200).json({
            status: 200,
            message: 'Note fetched successfully',
            data: {
                note: decryptedNote,
            },
        });
    } catch (error) {
        console.error(`Error handling request for note ${shortLink}:`, error);
        return res.status(500).json({
            status: 500,
            errorMessage: 'Server Error',
            errorDescription: 'An unexpected error occurred while processing your request.',
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀Server running on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);

});