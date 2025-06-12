$(function () {
  const speakerDevices = document.getElementById("speaker-devices");
  const ringtoneDevices = document.getElementById("ringtone-devices");
  const microphoneDevices = document.getElementById("microphone-devices");
  const outputVolumeBar = document.getElementById("output-volume");
  const inputVolumeBar = document.getElementById("input-volume");
  const volumeIndicators = document.getElementById("volume-indicators");
  const callButton = document.getElementById("button-call");
  const outgoingCallHangupButton = document.getElementById("button-hangup-outgoing");
  const callControlsDiv = document.getElementById("call-controls");
  const audioSelectionDiv = document.getElementById("output-selection");
  const getAudioDevicesButton = document.getElementById("get-devices");
  const logDiv = document.getElementById("log");
  const incomingCallDiv = document.getElementById("incoming-call");
  const incomingCallHangupButton = document.getElementById(
    "button-hangup-incoming"
  );
  const incomingCallAcceptButton = document.getElementById(
    "button-accept-incoming"
  );
  const incomingCallRejectButton = document.getElementById(
    "button-reject-incoming"
  );
  const phoneNumberInput = document.getElementById("phone-number");
  const incomingPhoneNumberEl = document.getElementById("incoming-number");
  const startupButton = document.getElementById("startup-button");

  let device;
  let token;
  let availableMicrophones = [];

  // Check if running on mobile device
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    log("Mobile device detected - optimizing for mobile experience");
  }

  // Event Listeners

  callButton.onclick = (e) => {
    e.preventDefault();
    makeOutgoingCall();
  };
  getAudioDevicesButton.onclick = getAudioDevices;
  speakerDevices.addEventListener("change", updateOutputDevice);
  ringtoneDevices.addEventListener("change", updateRingtoneDevice);
  microphoneDevices.addEventListener("change", updateInputDevice);

  // SETUP STEP 1:
  // Browser client should be started after a user gesture
  // to avoid errors in the browser console re: AudioContext
  startupButton.addEventListener("click", startupClient);

  // SETUP STEP 2: Request an Access Token
  async function startupClient() {
    log("Requesting Access Token...");

    try {
      const data = await $.getJSON("/token");
      log("Got a token.");
      token = data.token;
      setClientNameUI(data.identity);
      intitializeDevice();
    } catch (err) {
      console.log(err);
      log("An error occurred. See your browser console for more information.");
    }
  }

  // SETUP STEP 3:
  // Instantiate a new Twilio.Device
  function intitializeDevice() {
    logDiv.classList.remove("hide");
    log("Initializing device");
    
    // Simplified device configuration - remove conflicting audio constraints
    const deviceConfig = {
      logLevel: 1,
      codecPreferences: ["opus", "pcmu"],
      closeProtection: true
    };

    device = new Twilio.Device(token, deviceConfig);

    addDeviceListeners(device);

    // Device must be registered in order to receive incoming calls
    device.register();
  }

  // SETUP STEP 4:
  // Listen for Twilio.Device states
  function addDeviceListeners(device) {
    device.on("registered", function () {
      log("Twilio.Device Ready to make and receive calls!");
      callControlsDiv.classList.remove("hide");
      
      // Show audio selection UI if it is supported by the browser.
      if (device.audio.isOutputSelectionSupported || device.audio.isInputSelectionSupported) {
        audioSelectionDiv.classList.remove("hide");
        // Update devices immediately after registration
        updateAllAudioDevices();
      }
    });

    device.on("error", function (error) {
      log("Twilio.Device Error: " + error.message);
      console.error("Device error:", error);
    });

    device.on("incoming", handleIncomingCall);

    device.audio.on("deviceChange", updateAllAudioDevices.bind(device));
  }

  // MAKE AN OUTGOING CALL

  async function makeOutgoingCall() {
    var params = {
      // get the phone number to call from the DOM
      To: phoneNumberInput.value,
    };

    if (device) {
      log(`Attempting to call ${params.To} ...`);

      try {
        // Ensure microphone permission is granted before making call
        await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
        
        // Get selected microphone device
        const selectedMicrophone = getSelectedMicrophoneDevice();
        if (selectedMicrophone) {
          log(`Using microphone: ${selectedMicrophone.label}`);
        }

        // Simplified connect call without audioConstraints to avoid conflicts
        const call = await device.connect({ params });

        // add listeners to the Call
        // "accepted" means the call has finished connecting and the state is now "open"
        call.on("accept", updateUIAcceptedOutgoingCall);
        call.on("disconnect", updateUIDisconnectedOutgoingCall);
        call.on("cancel", updateUIDisconnectedOutgoingCall);
        call.on("error", (error) => {
          log(`Call error: ${error.message}`);
          console.error('Call error:', error);
        });

        outgoingCallHangupButton.onclick = () => {
          log("Hanging up ...");
          call.disconnect();
        };

      } catch (error) {
        log(`Error making call: ${error.message}`);
        console.error('Call error:', error);
      }

    } else {
      log("Unable to make call.");
    }
  }

  function updateUIAcceptedOutgoingCall(call) {
    log("Call in progress ...");
    callButton.disabled = true;
    outgoingCallHangupButton.classList.remove("hide");
    volumeIndicators.classList.remove("hide");
    bindVolumeIndicators(call);
  }

  function updateUIDisconnectedOutgoingCall() {
    log("Call disconnected.");
    callButton.disabled = false;
    outgoingCallHangupButton.classList.add("hide");
    volumeIndicators.classList.add("hide");
  }

  // HANDLE INCOMING CALL

  function handleIncomingCall(call) {
    log(`Incoming call from ${call.parameters.From}`);

    //show incoming call div and incoming phone number
    incomingCallDiv.classList.remove("hide");
    incomingPhoneNumberEl.innerHTML = call.parameters.From;

    //add event listeners for Accept, Reject, and Hangup buttons
    incomingCallAcceptButton.onclick = () => {
      acceptIncomingCall(call);
    };

    incomingCallRejectButton.onclick = () => {
      rejectIncomingCall(call);
    };

    incomingCallHangupButton.onclick = () => {
      hangupIncomingCall(call);
    };

    // add event listener to call object
    call.on("cancel", handleDisconnectedIncomingCall);
    call.on("disconnect", handleDisconnectedIncomingCall);
    call.on("reject", handleDisconnectedIncomingCall);
  }

  // ACCEPT INCOMING CALL

  function acceptIncomingCall(call) {
    // Ensure microphone permission before accepting call
    navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    }).then(() => {
      call.accept();
      
      //update UI
      log("Accepted incoming call.");
      incomingCallAcceptButton.classList.add("hide");
      incomingCallRejectButton.classList.add("hide");
      incomingCallHangupButton.classList.remove("hide");
    }).catch((error) => {
      log(`Error accessing microphone: ${error.message}`);
      console.error('Microphone access error:', error);
    });
  }

  // REJECT INCOMING CALL

  function rejectIncomingCall(call) {
    call.reject();
    log("Rejected incoming call");
    resetIncomingCallUI();
  }

  // HANG UP INCOMING CALL

  function hangupIncomingCall(call) {
    call.disconnect();
    log("Hanging up incoming call");
    resetIncomingCallUI();
  }

  // HANDLE CANCELLED INCOMING CALL

  function handleDisconnectedIncomingCall() {
    log("Incoming call ended.");
    resetIncomingCallUI();
  }

  // MISC USER INTERFACE

  // Activity log
  function log(message) {
    logDiv.innerHTML += `<p class="log-entry">&gt;&nbsp; ${message} </p>`;
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  function setClientNameUI(clientName) {
    var div = document.getElementById("client-name");
    div.innerHTML = `Your client name: <strong>${clientName}</strong>`;
  }

  function resetIncomingCallUI() {
    incomingPhoneNumberEl.innerHTML = "";
    incomingCallAcceptButton.classList.remove("hide");
    incomingCallRejectButton.classList.remove("hide");
    incomingCallHangupButton.classList.add("hide");
    incomingCallDiv.classList.add("hide");
  }

  // AUDIO CONTROLS

  async function getAudioDevices() {
    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      log("Microphone permission granted");
      
      // Get all available audio input devices
      await updateMicrophoneDevices();
      updateAllAudioDevices();
    } catch (error) {
      log("Error accessing microphone: " + error.message);
      console.error("Microphone access error:", error);
    }
  }

  // Get all available microphone devices using Web Audio API
  async function updateMicrophoneDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
      
      availableMicrophones = audioInputDevices;
      log(`Found ${audioInputDevices.length} microphone device(s)`);
      
      // Update the microphone dropdown
      updateMicrophoneDropdown(audioInputDevices);
      
    } catch (error) {
      log("Error enumerating microphone devices: " + error.message);
      console.error("Device enumeration error:", error);
    }
  }

  // Update the microphone dropdown with available devices
  function updateMicrophoneDropdown(audioInputDevices) {
    microphoneDevices.innerHTML = "";
    
    audioInputDevices.forEach((device, index) => {
      const option = document.createElement("option");
      option.label = device.label || `Microphone ${index + 1}`;
      option.value = device.deviceId;
      option.setAttribute("data-id", device.deviceId);
      
      // Select the first device by default
      if (index === 0) {
        option.setAttribute("selected", "selected");
      }
      
      microphoneDevices.appendChild(option);
    });
    
    log("Microphone devices updated");
  }

  // Get the currently selected microphone device
  function getSelectedMicrophoneDevice() {
    const selectedOption = microphoneDevices.options[microphoneDevices.selectedIndex];
    if (selectedOption) {
      return availableMicrophones.find(device => device.deviceId === selectedOption.value);
    }
    return null;
  }

  function updateAllAudioDevices() {
    if (device) {
      updateDevices(speakerDevices, device.audio.speakerDevices.get());
      updateDevices(ringtoneDevices, device.audio.ringtoneDevices.get());
      
      // Update microphone devices if not already done
      if (availableMicrophones.length === 0) {
        updateMicrophoneDevices();
      }
    }
  }

  function updateOutputDevice() {
    const selectedDevices = Array.from(speakerDevices.children)
      .filter((node) => node.selected)
      .map((node) => node.getAttribute("data-id"));

    device.audio.speakerDevices.set(selectedDevices);
    log("Speaker device updated");
  }

  function updateRingtoneDevice() {
    const selectedDevices = Array.from(ringtoneDevices.children)
      .filter((node) => node.selected)
      .map((node) => node.getAttribute("data-id"));

    device.audio.ringtoneDevices.set(selectedDevices);
    log("Ringtone device updated");
  }

  function updateInputDevice() {
    const selectedDevice = getSelectedMicrophoneDevice();
    if (selectedDevice) {
      log(`Microphone changed to: ${selectedDevice.label}`);
    }
  }

  function bindVolumeIndicators(call) {
    call.on("volume", function (inputVolume, outputVolume) {
      var inputColor = "red";
      if (inputVolume < 0.5) {
        inputColor = "green";
      } else if (inputVolume < 0.75) {
        inputColor = "yellow";
      }

      inputVolumeBar.style.width = Math.floor(inputVolume * 300) + "px";
      inputVolumeBar.style.background = inputColor;

      var outputColor = "red";
      if (outputVolume < 0.5) {
        outputColor = "green";
      } else if (outputVolume < 0.75) {
        outputColor = "yellow";
      }

      outputVolumeBar.style.width = Math.floor(outputVolume * 300) + "px";
      outputVolumeBar.style.background = outputColor;
    });
  }

  // Update the available ringtone and speaker devices
  function updateDevices(selectEl, selectedDevices) {
    selectEl.innerHTML = "";

    device.audio.availableOutputDevices.forEach(function (device, id) {
      var isActive = selectedDevices.size === 0 && id === "default";
      selectedDevices.forEach(function (device) {
        if (device.deviceId === id) {
          isActive = true;
        }
      });

      var option = document.createElement("option");
      option.label = device.label;
      option.setAttribute("data-id", id);
      if (isActive) {
        option.setAttribute("selected", "selected");
      }
      selectEl.appendChild(option);
    });
  }

  // Listen for device changes
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      log("Audio devices changed - updating device list");
      updateMicrophoneDevices();
    });
  }

  // Test microphone access function
  function testMicrophoneAccess() {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        log("Microphone access successful");
        // Create a simple audio context to test
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        log("Audio context created successfully");
      })
      .catch(error => {
        log(`Microphone access failed: ${error.message}`);
        console.error('Microphone test error:', error);
      });
  }
});