/**
 *  Nyah Bridge
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
metadata {
	definition (name: "Nyah Bridge", namespace: "ipsumdomus-com", author: "Ipsumdomus.com") {
    	capability "Bridge"
		capability "Health Check"
        
        attribute "networkAddress", "string"
        attribute "status", "string"
	}


	simulator {
		// TODO: define status and reply messages here
	}

	tiles {
		tiles(scale: 2) {
     	multiAttributeTile(name:"rich-control", type:"generic"){
			tileAttribute ("device.status", key: "PRIMARY_CONTROL") {
				attributeState "Offline", label: '${currentValue}', action: "", icon: "st.unknown.zwave.static-controller", backgroundColor: "#ffffff"
	            attributeState "Online", label: '${currentValue}', action: "", icon: "st.unknown.zwave.static-controller", backgroundColor: "#79b821"
			}
		}
        
        valueTile("networkAddress", "device.networkAddress", decoration: "flat", height: 2, width: 6, inactiveLabel: false) {
			state "default", label:'IP: ${currentValue}'
		}
        
		main (["rich-control"])
		details(["rich-control", "networkAddress"])
	}
	}
}

void installed() {
	sendEvent(name: "DeviceWatch-Enroll", value: "{\"protocol\": \"LAN\", \"scheme\":\"untracked\", \"hubHardwareId\": \"${device.hub.hardwareID}\"}", displayed: false)
}

// parse events into attributes
def parse(String description) {
	log.debug "Parsing '${description}'"
    def results = []
	def result = parent.parse(this, description)
    log.trace "Parse result $result"

}