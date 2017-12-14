exports.get = (device, baseurl) => `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
    <specVersion>
        <major>1</major>
        <minor>0</minor>
    </specVersion>
    <URLBase>${baseurl}</URLBase>
    <device>
        <deviceType>urn:schemas-upnp-org:device:Basic:1</deviceType>
        <friendlyName>${device.name}</friendlyName>
<manufacturer>${device.manufacturer}</manufacturer>
<manufacturerURL>${device.manufacturerurl}</manufacturerURL>
<modelDescription>${device.desc}</modelDescription>
<modelName>${device.model}</modelName>
<modelNumber>${device.modelid}</modelNumber>
<modelURL>${device.modelurl}</modelURL>
<serialNumber>${device.serialnumber}</serialNumber>
<UDN>uuid:${device.id}</UDN>
<UPC>${device.upc}</UPC>
       <iconList>
<icon>
<mimetype>image/png</mimetype>
<width>24</width>
<height>24</height>
<depth>32</depth>
<url>${baseurl}/img/ic_developer_mode_black_24dp_1x.png</url>
</icon>
<icon>
<mimetype>image/png</mimetype>
<width>48</width>
<height>48</height>
<depth>32</depth>
<url>${baseurl}/img/ic_developer_mode_black_24dp_2x.png</url>
</icon>
</iconList>
        <presentationURL>${baseurl}/${device.id}</presentationURL>
    </device>
</root>`
