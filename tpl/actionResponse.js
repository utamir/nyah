exports.get = (action, serviceType, args) => `<?xml version="1.0"?>
<s:Envelope
 xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
 s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
    <s:Body>
        <u:${action}Response xmlns:u=${serviceType}>
            ${args}
        </u:${action}Response>
    </s:Body>
</s:Envelope>`;