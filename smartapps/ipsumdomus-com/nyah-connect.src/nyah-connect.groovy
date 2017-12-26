/**
 *  Nyah (Connect)
 *
 *  Copyright 2017 Ipsumdomus.com
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License. You may obtain a copy of the License at:
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under the License is distributed
 *  on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License
 *  for the specific language governing permissions and limitations under the License.
 *
 */
definition(
    name: "Nyah (Connect)",
    namespace: "ipsumdomus-com",
    author: "Ipsumdomus.com",
    description: "Connects your NYAH - Not Yet Another Hub and allows using all devices connected to it.\r\n",
    category: "My Apps",
    iconUrl: "https://github.com/utamir/nyah/raw/master/tpl/img/nyah_24dp_1x.png",
    iconX2Url: "https://github.com/utamir/nyah/raw/master/tpl/img/nyah_24dp_2x.png",
    iconX3Url: "https://github.com/utamir/nyah/raw/master/tpl/img/nyah_24dp_3x.png",
    singleInstance: true)


preferences {
	page(name: "bridgeDiscovery", title: "Nyah Device Setup", content: "bridgeDiscovery", refreshTimeout: 5)
    page(name: "bridgeDevices", title: "Nyah Device Setup", content: "bridgeDevices", refreshTimeout: 5)
    page(name: "bridgeDiscoveryFailed", title: "Nyah Device Setup Failed", content: "bridgeDiscoveryFailed", refreshTimeout: 0)
}

def bridgeDiscovery(params=[:]) {
	log.trace "Bridge Discovery"
                
    def inSetup = true
    def refreshInterval = 3
	def bridges = getNyahBridges()
    ssdpSubscribe()
    discoverBridges()
    
    def found = bridges.size() ?: 0
    //TODO: Handle timeouts when bridge not found
    if(found == 0) {
        return dynamicPage(name: "bridgeDiscovery", title: "Bridge Discovery", nextPage:"", refreshInterval: refreshInterval, uninstall: false) {
           section("") {
       		paragraph "Please wait while we discover your Nyah Bridge.", image: "https://github.com/utamir/nyah/raw/master/tpl/img/wait_24dp_2x.png"
           }
        }
    } else {
    	return bridgeDevices()
    }
}

def bridgeDevices() {
//TODO: refreshing and reruning bridgeDeviceDiscovery is bad thing. Find a way to avoid multiple run, but with refresh, which is required
	def refreshInterval = 3
	log.trace "Active Bridge Device $bridgeDevice"
    def bridges = getNyahBridges()
    def bridge = bridges?.find {it.value?.mac == bridgeDevice}
    if(bridge){     
     def devices = getNyahDevices() ?: [:]
     log.debug "Discovered Devices $devices"
	 return dynamicPage(name: "bridgeDevices", title: "Connected devices", nextPage:"", refreshInterval: refreshInterval, install: true, uninstall: true) {
            section("") {
               devices.each {
               	paragraph title: it.value.name, "${it.value.description}"/*, image: "https://github.com/utamir/nyah/raw/master/tpl/img/capability_${it.capability}_24dp_2x.png"*/
               } 
            }
     }
    } else {
    	return bridgeDiscoveryFailed()
    }
}

def bridgeDiscoveryFailed() {
 return dynamicPage(name:"bridgeDiscoveryFailed", title: "Bridge Discovery Failed", nextPage: "bridgeDiscovery") {
		section("Failed to discover any Nyah Bridges. Please confirm that the Nyah Bridge is connected to the same network as your SmartThings Hub, and that it has power.") {
		}
	 }
}

void discoverBridges() {    
	sendHubCommand(new physicalgraph.device.HubAction("lan discovery urn:ipsumdomus-com:device:Nyah:1", physicalgraph.device.Protocol.LAN))
}

def ssdpBridgeHandler(evt) {
	def description = evt.description
	log.trace "Location: $description"
    def hub = evt?.hubId
	def parsedEvent = parseLanMessage(description)
	parsedEvent << ["hub":hub]
    
    def bridges = getNyahBridges()
	log.trace bridges.toString()
    if (!(bridges."${parsedEvent.ssdpUSN.toString()}")) {
		//bridge does not exist        
        log.trace "Adding bridge ${parsedEvent.ssdpUSN}"
        bridges << ["${parsedEvent.ssdpUSN.toString()}":parsedEvent]
    } else {
    	log.debug "Known bridge"
        def ip = convertHexToIP(parsedEvent.networkAddress)
		def port = convertHexToInt(parsedEvent.deviceAddress)
		def host = ip + ":" + port
        log.trace "Getting devices information from $host"
        bridgeDevicesDiscovery(host)
		log.debug "Device ($parsedEvent.mac) was already found in state with ip = $host."
        def dstate = bridges."${parsedEvent.ssdpUSN.toString()}"
		def dniReceived = "${parsedEvent.mac}"
		def currentDni = dstate.mac
		def d = getChildDevice(currentDni)
        log.debug "Current DNI: $currentDni Received DNI: $dniReceived"
        if(currentDni != dniReceived) {
            // DNI changes - replace for child bridge device. Get latest only
            
            //TODO: handle MAC changes one day. should compart 
            //currentDni = dniReceived
        }
        def networkAddress = null
        if (!d) {
        	log.debug "Bridge device with $currentDni not found"
            app.updateSetting("bridgeDevice", [type: "device.nyahBridge", value: currentDni])            
        } else {
        	log.debug "Bridge with $dniReceived is found"
            updateBridgeStatus(d)
            if (d.getDeviceDataByName("networkAddress")) {
				networkAddress = d.getDeviceDataByName("networkAddress")
			} else {
				networkAddress = d.latestState('networkAddress').stringValue
			}
            log.trace "Host: $host - $networkAddress"
			if (host != networkAddress) {
				log.debug "Device's port or ip changed for device $d..."				
				d.sendEvent(name:"networkAddress", value: host)
				d.updateDataValue("networkAddress", host)
			}
            
        }
    }
}

void ssdpSubscribe() {
	subscribe(location, "ssdpTerm.urn:ipsumdomus-com:device:Nyah:1", ssdpBridgeHandler)
}

def addBridge() {
	log.trace "Adding Bridge device"
	def bridge = getNyahBridges().find {it.value.mac == bridgeDevice}
    if(bridge) {
    	def d = getChildDevice(bridgeDevice)
        if(!d) {
        	d = addChildDevice("ipsumdomus-com", "Nyah Bridge", bridgeDevice, bridge.value.hub, ["label": "Nyah Bridge"])
            if (d) {
            	d.completedSetup = true
                app.updateSetting("bridgeDevice", [type: "device.nyahBridge", value: d.id])
                log.debug "Created ${d.displayName} with id ${d.deviceNetworkId}"
                def childDevice = getChildDevice(d.deviceNetworkId)
                childDevice?.sendEvent(name: "status", value: "Online")
                childDevice?.sendEvent(name: "DeviceWatch-DeviceStatus", value: "online", displayed: false, isStateChange: true)
                updateBridgeStatus(childDevice)
                
                if (bridge.value.ip && bridge.value.port) {
						if (bridge.value.ip.contains(".")) {
							childDevice.sendEvent(name: "networkAddress", value: bridge.value.ip + ":" +  bridge.value.port)
							childDevice.updateDataValue("networkAddress", bridge.value.ip + ":" +  bridge.value.port)
						} else {
							childDevice.sendEvent(name: "networkAddress", value: convertHexToIP(bridge.value.ip) + ":" +  convertHexToInt(bridge.value.port))
							childDevice.updateDataValue("networkAddress", convertHexToIP(bridge.value.ip) + ":" +  convertHexToInt(bridge.value.port))
						}
					} else {
						childDevice.sendEvent(name: "networkAddress", value: convertHexToIP(bridge.value.networkAddress) + ":" +  convertHexToInt(bridge.value.deviceAddress))
						childDevice.updateDataValue("networkAddress", convertHexToIP(bridge.value.networkAddress) + ":" +  convertHexToInt(bridge.value.deviceAddress))
					}
            } else {
                log.error "Failed to create Nyah Bridge device"
            }	
        } else {
        	log.debug "found ${d.displayName} with id $bridgeDevice already exists"
        }
    } else {
    	log.trace "$bridgeDevice is unknown"
    }
}

private getDeviceType(capabilities){
	if(capabilities.any {
    	it.attributes?.any { 
            	it.attribute == "switch"
            }
    }) { 
    	return "Nyah Switch"
    } else {
    	return null
    }
}

def addDevices() {
	def bridge = getNyahBridges().find {it.value.mac == bridgeDevice}
    if(bridge) {
        def devices = getNyahDevices()
        devices.each {
            def d = getChildDevice(it.key)
            if(!d){
                def deviceType = getDeviceType(it.value.capabilities)
                if(deviceType) {
                    d = addChildDevice("ipsumdomus-com", deviceType, it.key, bridge.value.hub, ["label": it.value.name])
                    if(d){
                        log.debug "created ${d.displayName} with id $it.key"
                        d.completedSetup = true
                    }
                } else {
                    log.warn "Capabilities $it.value.capabilities are not supported"
                }
            }
        }
    }
}

private void updateBridgeStatus(childDevice) {
	// Update activity timestamp if child device is a valid bridge
	def bridge = getNyahBridges().find {
		"${it.value.mac}".toUpperCase() == childDevice?.device?.deviceNetworkId?.toUpperCase()
	}
	bridge?.value?.lastActivity = now()
	if (bridge && childDevice?.device?.currentValue("status") == "Offline") {
		log.debug "$childDevice is back Online"
		childDevice?.sendEvent(name: "status", value: "Online")
		childDevice?.sendEvent(name: "DeviceWatch-DeviceStatus", value: "online", displayed: false, isStateChange: true)
	}
}

private void checkBridgeStatus(){
	def bridges = getNyahBridges()
	def time = now() - (1000 * 60 * 11)
    bridges.each {
		def d = getChildDevice(it.value.mac)
		if (d) {
        	if (it.value.lastActivity < time) { // it.value.lastActivity != null &&
				if (d.currentStatus == "Online") {
					log.warn "$d is Offline"
					d.sendEvent(name: "status", value: "Offline")
					d.sendEvent(name: "DeviceWatch-DeviceStatus", value: "offline", displayed: false, isStateChange: true)

					Calendar currentTime = Calendar.getInstance()
                    def devices = getChildDevices()
                    if(devices) {
                        devices.each {
                            def id = it.device?.deviceNetworkId
                            if (state.devices[id]?.online == true) {
                                state.devices[id]?.online = false
                                state.devices[id]?.unreachableSince = currentTime.getTimeInMillis()
                                it.sendEvent(name: "DeviceWatch-DeviceStatus", value: "offline", displayed: false, isStateChange: true)
                            }
                        }
                    } else {
                    	log.trace "No child devices for application"
                    }
				}
			} else if (d.currentStatus == "Offline") {
				log.debug "$d is back Online"
				d.sendEvent(name: "DeviceWatch-DeviceStatus", value: "online", displayed: false, isStateChange: true)
				d.sendEvent(name: "status", value: "Online")//setOnline(false)
			}
        }
     }
}

def bridgeDevicesDiscovery(host) {
	log.debug "Bridge discovery: ${params}"
	sendHubCommand(new physicalgraph.device.HubAction([
    	method: "GET",
		path: "/devices",
        headers: [
		 HOST: host
		]],
        null,
        [callback: "bridgeDevicesDescriptionHandler"]
    ))
}

void bridgeDevicesDescriptionHandler(physicalgraph.device.HubResponse hubResponse) {
	log.debug "Discovered Devices: ${hubResponse.json}"
    def newDevices = hubResponse.json
    if(newDevices) {
    	def devices = getNyahDevices()
        //filter out only known capabilities
        newDevices.findAll {it.capabilities?.flatten()?.any { 
        	it.attributes?.any { 
            	it.attribute == "switch"
            }
        }}.each {
            devices << ["${it.id.toString()}":it]
        }
     } else {
     	log.trace "No or empty response from hub"
     }
}

private poll(){
	def host = getBridgeIP()
    def devices = getNyahDevices()
    def address = location.hubs[0].localIP + ":" + location.hubs[0].localSrvPortTCP
    def extIp = address.bytes.encodeBase64()
    log.debug "Subscribe callback $address ($extIp}"
    devices.each {
    //device query
    	def uri1 = "/action/${it.key}/query/"
		log.debug "GET: $host$uri1"
		sendHubCommand(new physicalgraph.device.HubAction("GET ${uri1} HTTP/1.1\r\n" +
			"HOST: ${host}\r\n\r\n", physicalgraph.device.Protocol.LAN, bridgeDevice))
            
    //device subscription
    	def uri2 = "/action/${it.key}/subscribe/$extIp"
		log.debug "SUBSCRIBE: $host$uri2"
		sendHubCommand(new physicalgraph.device.HubAction("GET ${uri2} HTTP/1.1\r\n" +
			"HOST: ${host}\r\n\r\n", physicalgraph.device.Protocol.LAN, bridgeDevice))
    }	
}

private getBridgeIP() {
	def host = null
	if (bridgeDevice) {
		def d = getChildDevice(bridgeDevice)
		if (d) {
			if (d.getDeviceDataByName("networkAddress"))
				host =  d.getDeviceDataByName("networkAddress")
			else
				host = d.latestState('networkAddress').stringValue
		}
    }
    log.trace "Bridge: $bridgeDevice - Host: $host"
    return host
}

def doDeviceSync(){
	log.trace "Doing Nyah Device Sync!"
    poll()
    ssdpSubscribe()
    discoverBridges()
    checkBridgeStatus()
}

def getNyahDevices() {
	state.devices = state.devices ?: [:]
}

def getNyahBridges() {
	state.bridges = state.bridges ?: [:]
}

private String convertHexToIP(hex) {
	[convertHexToInt(hex[0..1]),convertHexToInt(hex[2..3]),convertHexToInt(hex[4..5]),convertHexToInt(hex[6..7])].join(".")
}

private Integer convertHexToInt(hex) {
	Integer.parseInt(hex,16)
}

def installed() {
	log.debug "Installed with settings: ${settings}"

	initialize()
}

def updated() {
	log.debug "Updated with settings: ${settings}"

	unsubscribe()
    unschedule()
	initialize()
}

def initialize() {
	log.debug "Initializing"
	unsubscribe(bridge)
    setupDeviceWatch()
    if(bridgeDevice) {
    	addBridge()
        //addDevices()
        runIn(5, "addDevices")
        doDeviceSync()
		runEvery5Minutes("doDeviceSync")
    }
}

def uninstalled(){
	app.updateSetting("bridgeDevice", null)
	state.bridges = [:]
    state.devices = [:]
}

private setupDeviceWatch() {
	def hub = location.hubs[0]
    def devices = getChildDevices()
    if(devices) {
        devices.each {
            it.sendEvent(name: "DeviceWatch-Enroll", value: "{\"protocol\": \"LAN\", \"scheme\":\"untracked\", \"hubHardwareId\": \"${hub?.hub?.hardwareID}\"}")
        }
    }
}

private handlePoll(body) {
    def device = getChildDevices().find { it.deviceNetworkId == "${body.id}" }
    log.debug "Handling device: $device - Body: $body"
    if(device){
    	if(!body.error) {
            if (state.devices[body.id]?.online == false || state.devices[body.id]?.online == null) {
                // light just came back online, notify device watch
                device.sendEvent(name: "DeviceWatch-DeviceStatus", value: "online", displayed: false, isStateChange: true)
                log.debug "$device is Online"
            }
            // Mark light as "online"
            state.devices[device.id]?.unreachableSince = null
            state.devices[device.id]?.online = true
            body?.attributes.each {
                log.debug "Sending $it"
                device.sendEvent(name: "switch", value: (it.switch == true) ? "on" : "off", displayed: false)
            }
        } else {
        	if (state.devices[body.id]?.online == true || state.devices[body.id]?.online == null) {
                device.sendEvent(name: "DeviceWatch-DeviceStatus", value: "offline", displayed: false, isStateChange: true)
                log.debug "$device is Offline"
            }
        }
    }
    return []
}

// Child activities
def parse(childDevice, description) {
	// Update activity timestamp if child device is a valid bridge
	updateBridgeStatus(childDevice)

	def parsedEvent = parseLanMessage(description)
    log.trace "Child parse: $parsedEvent"
    if (parsedEvent.headers && parsedEvent.body) {
    	def headerString = parsedEvent.headers.toString()
		def bodyString = parsedEvent.body.toString()
		if (headerString?.contains("json")) {
			def body = parseJson(bodyString)
            return handlePoll(body)
        }
    }
    log.debug "parse - got something other than headers,body..."
	return []
}

def on(childDevice) {
	log.debug "Executing 'on'"
	/*def id = getId(childDevice)
	updateInProgress()*/
	createSwitchEvent(childDevice, "on")
    sendCommand(childDevice, "on")
	/*put("lights/$id/state", [on: true])
	*/return "Bulb is turning On"
}

def off(childDevice) {
	log.debug "Executing 'off'"
	/*def id = getId(childDevice)
	updateInProgress()*/
	createSwitchEvent(childDevice, "off")
    sendCommand(childDevice, "off")
	/*put("lights/$id/state", [on: false])
	*/return "Bulb is turning Off"
}

private void sendCommand(childDevice, setSwitch){
	log.debug "Send command - Device $childDevice - $setSwitch"
	def host = getBridgeIP()
    def uri = "/action/${childDevice?.device?.deviceNetworkId}/${setSwitch}/"
	log.debug "GET: $host$uri"
	sendHubCommand(new physicalgraph.device.HubAction("GET ${uri} HTTP/1.1\r\n" +
		"HOST: ${host}\r\n\r\n", physicalgraph.device.Protocol.LAN, bridgeDevice))
}

private void createSwitchEvent(childDevice, setSwitch) {
	// Create on, off, turningOn or turningOff event as necessary
	def currentState = childDevice.device?.currentValue("switch")
    log.debug "Switch event actual: $currentState required: $setSwitch"
	if ((currentState == "off" || currentState == "turningOff")) {
		if (setSwitch == "on") {
			childDevice.sendEvent(name: "switch", value: "turningOn", displayed: false)
		}
	} else if ((currentState == "on" || currentState == "turningOn")) {
		if (setSwitch == "off") {
			childDevice.sendEvent(name: "switch", value: "turningOff", displayed: false)
		}
	}
}