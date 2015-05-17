/*
 *  Copyright (c) 2014 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */
var RTCPeerConnection=null,getUserMedia=null,attachMediaStream=null,reattachMediaStream=null,webrtcDetectedBrowser=null,webrtcDetectedVersion=null;function trace(a){"\n"==a[a.length-1]&&(a=a.substring(0,a.length-1));console.log((performance.now()/1E3).toFixed(3)+": "+a)}function maybeFixConfiguration(a){if(a)for(var b=0;b<a.iceServers.length;b++)a.iceServers[b].hasOwnProperty("urls")&&(a.iceServers[b].url=a.iceServers[b].urls,delete a.iceServers[b].urls)} if(navigator.mozGetUserMedia)console.log("This appears to be Firefox"),webrtcDetectedBrowser="firefox",webrtcDetectedVersion=parseInt(navigator.userAgent.match(/Firefox\/([0-9]+)\./)[1],10),RTCPeerConnection=function(a,b){maybeFixConfiguration(a);return new mozRTCPeerConnection(a,b)},RTCSessionDescription=mozRTCSessionDescription,RTCIceCandidate=mozRTCIceCandidate,getUserMedia=navigator.mozGetUserMedia.bind(navigator),navigator.getUserMedia=getUserMedia,createIceServer=function(a,b,e){var c=null, d=a.split(":");if(0===d[0].indexOf("stun"))c={url:a};else if(0===d[0].indexOf("turn"))if(27>webrtcDetectedVersion){if(a=a.split("?"),1===a.length||0===a[1].indexOf("transport=udp"))c={url:a[0],credential:e,username:b}}else c={url:a,credential:e,username:b};return c},createIceServers=function(a,b,e){var c=[];for(i=0;i<a.length;i++){var d=createIceServer(a[i],b,e);null!==d&&c.push(d)}return c},attachMediaStream=function(a,b){console.log("Attaching media stream");a.mozSrcObject=b;a.play()},reattachMediaStream= function(a,b){console.log("Reattaching media stream");a.mozSrcObject=b.mozSrcObject;a.play()};else if(navigator.webkitGetUserMedia){console.log("This appears to be Chrome");var webrtcDetectedBrowser="chrome",result=navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./),webrtcDetectedVersion=null!==result?parseInt(result[2],10):999;createIceServer=function(a,b,e){var c=null,d=a.split(":");0===d[0].indexOf("stun")?c={url:a}:0===d[0].indexOf("turn")&&(c={url:a,credential:e,username:b});return c};createIceServers= function(a,b,e){var c=[];if(34<=webrtcDetectedVersion)c={urls:a,credential:e,username:b};else for(i=0;i<a.length;i++){var d=createIceServer(a[i],b,e);null!==d&&c.push(d)}return c};RTCPeerConnection=function(a,b){34>webrtcDetectedVersion&&maybeFixConfiguration(a);return new webkitRTCPeerConnection(a,b)};getUserMedia=navigator.webkitGetUserMedia.bind(navigator);navigator.getUserMedia=getUserMedia;attachMediaStream=function(a,b){"undefined"!==typeof a.srcObject?a.srcObject=b:"undefined"!==typeof a.mozSrcObject? a.mozSrcObject=b:"undefined"!==typeof a.src?a.src=URL.createObjectURL(b):console.log("Error attaching stream to element.")};reattachMediaStream=function(a,b){a.src=b.src}}else console.log("Browser does not appear to be WebRTC-capable");