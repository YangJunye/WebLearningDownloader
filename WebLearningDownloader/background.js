zip.workerScriptsPath = "/lib/";

var obj = this;
var requestFileSystem = obj.webkitRequestFileSystem || obj.mozRequestFileSystem || obj.requestFileSystem;
var archive_name;

function onerror(message) {
    console.log(message);
}

var model = (function() {
    var zipFileEntry, zipWriter, writer, creationMethod, URL = obj.webkitURL || obj.mozURL || obj.URL;

    return {
        setCreationMethod : function(method) {
            creationMethod = method;
        },
        addFiles : function addFiles(files, oninit, onadd, onprogress, onend) {
            var addIndex = 0;

            function nextFile() {
                var file = files[addIndex];
                onadd(file);
                zipWriter.add(file.name, new zip.BlobReader(file.data), function() {
                    addIndex++;
                    if (addIndex < files.length)
                        nextFile();
                    else
                        onend();
                }, onprogress);
            }

            function createZipWriter() {
                zip.createWriter(writer, function(writer) {
                    zipWriter = writer;
                    oninit();
                    nextFile();
                }, onerror);
            }

            if (zipWriter)
                nextFile();
            else if (creationMethod == "Blob") {
                writer = new zip.BlobWriter();
                createZipWriter();
            }
        },
        getBlobURL : function(callback) {
            zipWriter.close(function(blob) {
                var blobURL = creationMethod == "Blob" ? URL.createObjectURL(blob) : zipFileEntry.toURL();
                callback(blobURL);
                zipWriter = null;
            });
        },
        getBlob : function(callback) {
            zipWriter.close(callback);
        }
    };
})();

var files = {};
function downloadFile(url, filename, onSuccess, arrayOfUrl, filenames) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = "blob";
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            if (onSuccess) {
                onSuccess(xhr.response, arrayOfUrl, filenames);
            }
        }
    }
    xhr.send(null);
}

function onDownloadComplete(blobData, urls, filenames) {
    if (count < urls.length) {
        var filename = filenames[count];
        files[filename]= {name: filename, data: blobData};
        if (count < urls.length - 1) {
            count++;
            downloadFile(urls[count], filenames[count], onDownloadComplete, urls, filenames);
        } else {
            zipAndSaveFiles(filenames);
        }
    }
}

function is_downloaded(filename) {
    return files[filename] !== undefined;
}

function getFiles(filenames) {
    result = [];
    for (var i = 0; i < filenames.length; ++i) {
        result.push(files[filenames[i]]);
    }
    return result;
}

var count;
chrome.runtime.onMessage.addListener(function(msg) {
    if ((msg.action === 'download') && (msg.urls !== undefined)) {
        chrome.tabs.insertCSS(null, {file: "mycss.css"});
        filenames = msg.filenames;
        urls = msg.urls;
        archive_name = msg.archive_name;
        for (count = 0; count <filenames.length; ++count) {
            if (!is_downloaded(filenames[count]))
                break;
        }
        if (count < filenames.length) {
            downloadFile(urls[count], filenames[count], onDownloadComplete, urls, filenames);
        } else {
            zipAndSaveFiles(filenames);
        }
    }
})

function zipAndSaveFiles(filenames) {
    zip_needed_files = getFiles(filenames);
    if (zip_needed_files.length > 1) {
        model.setCreationMethod("Blob");
        model.addFiles(zip_needed_files,
            function() {}, function(file) {}, function(current, total) {},
            function() {
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    chrome.tabs.sendMessage(tabs[0].id, {message: "downloadComplete"}, function(response) {
                    });
                });
                model.getBlobURL(function(url) {
                    chrome.downloads.download({
                        url: url,
                        filename: archive_name,
                        saveAs: true
                    });
                });
            }
        );
    } else {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {message: "downloadComplete"}, function(response) {
            });
        });
        chrome.downloads.download({
            url: URL.createObjectURL(zip_needed_files[0].data),
            filename: filenames[0],
            saveAs: true
        });
    }
}
