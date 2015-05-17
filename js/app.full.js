var local_video_stream;
var remote_video_stream;
var peerConnection;
var leftIsLocalStream = true;
var callIDParameter = '';


// SOUNDS - buffers automatically when created
var bumsSound = new Audio("sounds/bums.wav"); 
var pfiffSound = new Audio("sounds/pfiff.wav"); 
var ovationSound = new Audio("sounds/ovation.wav"); 
var booSound = new Audio("sounds/boo.wav"); 

// GAME LOGIC VARIABLES
var leftPlayerScore = 0;
var rightPlayerScore = 0;
var isCalibrated = false; // true if calibration has been performed
var lastBallStartOnLeft = leftIsLocalStream; // true if the ball was inserted to the left player (last known insert)
var countdownTimerID; // the id of the countdown timer; not a DOM-ID but the id fin setInterval() invocation
var countdownDuration = 5;
var isSlaveReady = false; // set to true when the right player is ready
var isMasterReady = false; // set to true when left player is ready (this variable is meaningless for a slave)
var maxScore = 5;
// END GAME LOGIC VARIABLES

// STRINGS
var stringWaitingForOtherPlayer = "Waiting for other player";
var stringGameCommencing = "Commencing...";
var stringPlay= "PLAY!";
var stringRestart = "Restart";
// END STRINGS

// PHYSICS
var gWorld = null;
var labelBall = 'labelBall';
var labelNet = 'labelNet';
var labelHuman = 'labelHuman'; // human after all: https://www.youtube.com/watch?v=JIOCc0tfoqA
var ballRadius = 20;
// max measured speed without limit was 0.9738839626539109
var maxSpeedAllowed = 0.5; // a value that ball's speed should not exceed
var maxSpeedSoFar = 0; // for debug purposes
var animationOffset = 40; // the playfield is animationOffset higher than the camera image

/*
* Coordinates of R-pixels (RED) that represent centroids of squares which belong to the player.
* Those are centroids of white blocks that come from applying of fast median filter on the thresholded binary image.
*/ 
var humanCoordinates = [];
var gHumanSquares = []; // an array of PhysicsJS-squares derived from humanCoordinates
var gHuman; // a polygon representing the human

// CANVASES
var left_canvas,
	right_canvas,
	displayLeftVideoDownscaled,
	displaySubtractedBackground,
	displayForegroundthreshold,
	displayMedian,
	displayMedianEdges,
	displayGradient,
	displayNoBackground,
	displayPhoto;
	
// 2D CONTEXTES
var left_canvas_ctx,
	right_canvas_ctx,
	displayLeftVideoDownscaledContext,
	displaySubtractedBackgroundContext,
	displayForegroundthresholdContext,
	displayMedianContext,
	displayMedianEdgesContext,
	displayGradientContext,
	displayNoBackgroundContext,
	displayPhotoContext;
	
var videoWidthScaled; // width of a single downscaled video
var videoWidth; // width of a single unscaled video
var videoHeight; // height of a single unscaledVideo
var videoWidthDivHeight; // videoWidthDivHeight = width/height
var videoWidthDivTwo; // videoWidth/2
var videoWidthMinusOne;
var scalingFactor; // scalingFactor = unscaledVideoWidth/scaledVideoWidth = unscaledVideoHeight/scaledVideoHeight
var medianMaskSizeTimesScalingFactor;
var medianMaskSizeDivTwoTimesScalingFactor;

var peer = new Peer({
		//key: 'lwjd5qra8257b9', // key from examples
		key: '27ayhd78o9u23xr', // our key
		debug: 3, 
		// Pass in optional STUN and TURN server for maximum network compatibility
		config: {'iceServers': [{ url: 'stun:stun.l.google.com:19302'}
]}});

peer.on('open', function(){
	$('#my-id').val(document.URL+'?call='+peer.id);
});
 
// Receiving a call
peer.on('call', function(call){
	// Answer the call automatically
	call.answer(local_video_stream);
	call.on('stream', function(stream){
		assertVideoStreams(true, stream);
	});
	if(isCalibrated){
		renameButtonToPlayAndEnableIt(stringPlay);
	}
});


// listen to data connections
peer.on('connection', function(conn){
	peerConnection = conn;
	if(peerConnection.label == "data_channel"){
		peerConnection.on('data', function(data){
			onDataReceived(data);
		});
	}
});

$(document).ready(function(){

	var callID = getUrlParams()['call'];
	if(callID != 'undefined' && callID){
		callIDParameter = callID;
	}

	$('#my-id').on('click', function(){
		$(this).select();
		return false;
	});

	thresholdValue = parseInt($('#thresholdSlider').val());
	$('#thresholdSlider').on('input', function(event) {
		$('#thresholdInput').text($(this).val());
		thresholdValue = parseInt($(this).val());
	});

	/*
	*	Debug information switcher
	*/
	$('#debugCheckbox').bootstrapSwitch();
	$('#debugCheckbox').on('switchChange.bootstrapSwitch', function(event, state) {
		
		if($('#debugCheckbox').bootstrapSwitch('state')){
			$('.visibleOnDebug').show();
		}else{
			$('.visibleOnDebug').hide();
		}

		return false;
	});

	launchVideoStream();
});

// Sends json data to opponent
function sendData(json){
	if(peerConnection != null){
		console.log('Sent to opponent: ', json);
		peerConnection.send(json);
	}else{
		console.log('Can not send json to opponent! connection is null');
	}
}

function onDataReceived(json){
	console.log('Received from opponent: ', json);
	var gameState = json.gameState;
	switch (gameState){
		case 1:
			// master has spoken, ball will be inserted to the left
			renamePlayButton(stringGameCommencing);
			insertBallDelayed(true, countdownDuration);
			lastBallStartOnLeft = true;
			break;
		case 2:
			// slave has spoken
			isSlaveReady = true;
			if(isMasterReady){
				startGame();
			}
			break;
		case 3:
			// slave wants restart
			isMasterReady = true;
			isSlaveReady = true;
			lastBallStartOnLeft = leftIsLocalStream;
			startGame();
			break;
		case 4:
			// plays Bums sound
			bumsSound.play();
			break;
		case 5:
			// see what oponents says about the scores
			var oponentLeftScore = json.scoreLeft;
			var oponentRightScore = json.scoreRight;
			
			// only take the higher scores
			if(leftPlayerScore < oponentLeftScore)
				leftPlayerScore = oponentLeftScore;
				
			if(rightPlayerScore < oponentRightScore)
				rightPlayerScore = oponentRightScore;
				
			refreshScores(leftPlayerScore, rightPlayerScore);
			checkWinnerAndInsertBall();
			break;
		default:
			var ballObjSearch = {
			    name: 'circle',
			    labels: [labelBall]
			};
			var ballObjArr = gWorld.find(ballObjSearch);
			var ballObj = ballObjArr[0];
			ballObj.state.pos.x = json.ball.x;
			ballObj.state.pos.y = json.ball.y;
			ballObj.state.vel.x = json.ball.vx;
			ballObj.state.vel.y = json.ball.vy;
			ballObj.radius = json.ball.radius;
			ballObj.styles.fillStyle = json.ball.color;
	}

}

function makeCall(clicked){

	var call,
		con;

	if(clicked){
		call = peer.call($('#callto-id').val(), local_video_stream);
		con = peer.connect($('#callto-id').val(), {label: 'data_channel'});
	}else{
		call = peer.call(callIDParameter, local_video_stream);
		con = peer.connect(callIDParameter, {label: 'data_channel'});
	}
	
	// Creates a data channel with opponent
	con.on('open', function() {
		peerConnection = con;
	});
	
	con.on('data', function(data){
		onDataReceived(data);
	});
	
	// Wait for stream on the call, then set peer video display
	call.on('stream', function(stream){

		assertVideoStreams(false, stream);

		if(isCalibrated){
			renameButtonToPlayAndEnableIt(stringPlay);
		}
	});
}

function assertVideoStreams(isLeft, stream){

	remote_video_stream = stream;
	leftIsLocalStream = isLeft;

	if(isLeft){
		// Left the local stream and right the remote Stream
		attachMediaStream($('#left_video').first(), local_video_stream);
		attachMediaStream($('#right_video').first(), remote_video_stream);
		$('#right_video').prop('src', URL.createObjectURL(remote_video_stream));
		$('#left_video').prop('src', URL.createObjectURL(local_video_stream));
	}else{
		// otherwise
		attachMediaStream($('#left_video').first(), remote_video_stream);
		attachMediaStream($('#right_video').first(), local_video_stream);
		$('#right_video').prop('src', URL.createObjectURL(local_video_stream));
		$('#left_video').prop('src', URL.createObjectURL(remote_video_stream));
	}
}

/*
*	Starts video stream with WebRTC
*/
function launchVideoStream(){
	getUserMedia({ video : true, audio : false}, videoLaunchSuccess, videoLaunchFailed);
}

function videoLaunchSuccess(stream){
	var video = document.querySelector('#left_video');
	attachMediaStream(video, stream);

	local_video_stream = stream;

	$('.animation_container').show();
	$('#viewport').show();
	$('.debugBlock').show();
	$('.waitingCameraStream').hide();
	$('.streamStartedBlock').show();
	$('.scoreContainer').show();
	$('.container').css('margin-top', '10px');

	adjustCanvasToFitVideoStream();
	drawVideoToCanvas();
	insertPhysics();
	initEvents();

	setInterval(refresh,1000/10);
}

function videoLaunchFailed(error){
	var err_browser_not_supported = 'Sorry, but your camera is busy or your browser is not supporting getUserMedia()!';
    console.log(err_browser_not_supported);
    alert(err_browser_not_supported);
}

/*
*	Draws the left and right video to the left and right videoCanvases
*/
function drawVideoToCanvas(){
	var left_video = document.querySelector('#left_video');
	var right_video = document.querySelector('#right_video');
	
	var left_canvas = document.getElementById('left_video_canvas');
	var right_canvas = document.getElementById('right_video_canvas');
			
	var left_ctx = left_canvas.getContext('2d');
	var right_ctx = right_canvas.getContext('2d');
	
	if(left_video.played){
		if(leftIsLocalStream){

			displayLeftVideoDownscaledContext.clearRect(0, 0, displayLeftVideoDownscaled.width, displayLeftVideoDownscaled.height);
			displayLeftVideoDownscaledContext.drawImage(left_video, 0, 0, displayLeftVideoDownscaled.width, displayLeftVideoDownscaled.height);
			video = chooseVideo(left_video);
			left_ctx.clearRect(0, 0, left_canvas.width, left_canvas.height);
			left_ctx.drawImage(video ,0,0,left_canvas.width, left_canvas.height);
		}else{
			left_ctx.clearRect(0, 0, left_canvas.width, left_canvas.height);
			left_ctx.drawImage(left_video ,0,0,left_canvas.width, left_canvas.height);
		}
	}
	
	if(right_video.played){
		if(!leftIsLocalStream){

			displayLeftVideoDownscaledContext.clearRect(0, 0, displayLeftVideoDownscaled.width, displayLeftVideoDownscaled.height);
			displayLeftVideoDownscaledContext.drawImage(right_video, 0, 0, displayLeftVideoDownscaled.width, displayLeftVideoDownscaled.height);
			video = chooseVideo(right_video);
			right_ctx.clearRect(0, 0, right_canvas.width, right_canvas.height);
			right_ctx.drawImage(video ,0,0,right_canvas.width, right_canvas.height);
		}else{
			right_ctx.clearRect(0, 0, right_canvas.width, right_canvas.height);
			right_ctx.drawImage(right_video ,0,0,right_canvas.width, right_canvas.height);
		}
	}
}

/*
* Chooses the video source based on the radio Button value.
*/
function chooseVideo(video){

	var radioValue = parseInt($("input[name='imageProccessing']:checked").val());
	var result = video;

	switch(radioValue){
		case 1: result = displaySubtractedBackground;
			break;
		case 2: result = displayForegroundthreshold;
			break;
		case 3: result = displayMedian;
			break;
		case 4: result = displayMedianEdges;
			break;
		default:
			result = video;			
	}

	return result;
}

/*
*	Adjusts canvas to video stream
*/
function adjustCanvasToFitVideoStream(){

	$('.animation_container').css({
		'left': $('#left_video_canvas').position().left,
		'top': 0
		//'top': $('#left_video_canvas').position().top-40
	});

	$('#viewport, .animation_container').css({
		'width': $('.video').width()*2,
		'height': $('.video').position().top+$('.video').height()-animationOffset
	});
	
	// initialize canvases
	left_canvas = document.getElementById('left_video_canvas'); // left player feed
	right_canvas = document.getElementById('right_video_canvas'); // right player feed
	displayLeftVideoDownscaled = document.getElementById('displayLeftVideoDownscaled'); // downscaled left video
	displaySubtractedBackground = document.getElementById('displaySubtractedBackground'); // image without background
	displayForegroundthreshold = document.getElementById('displayForegroundthreshold'); // tresholded image
	displayMedian = document.getElementById('displayMedian'); // median image
	displayMedianEdges = document.getElementById('displayMedianEdges'); // edges on the median
	displayGradient = document.getElementById('displayGradient'); // gradient image
	displayNoBackground = document.getElementById('displayNoBackground'); // camera image without background
	displayPhoto = document.getElementById('displayNoBackground'); // image used for subtraction, obtained on calibration
	
	// if you remove this part you will get aliasing
	videoWidth = left_canvas.width = right_canvas.width = left_canvas.clientWidth;
	videoWidthScaled = displayLeftVideoDownscaled.width = displaySubtractedBackground.width = displayForegroundthreshold.width =
		displayMedian.width = displayMedianEdges.width = displayGradient.width = displayNoBackground.width = displayPhoto.width =
			displayLeftVideoDownscaled.clientWidth;
		
	videoHeight = left_canvas.height = right_canvas.height = left_canvas.clientHeight;
	displayLeftVideoDownscaled.height = displaySubtractedBackground.height = displayForegroundthreshold.height =
		displayMedian.height = displayMedianEdges.height = displayGradient.height = displayNoBackground.height = displayPhoto.height =
			displayLeftVideoDownscaled.clientHeight;
		
	// Initialize variables that depend on videoWidthScaled
	videoWidthDivHeight = videoWidth / videoHeight;
	skip = (videoWidthScaled * (medianMaskSize - 1 )) << 2, // number of pixels to skip when performing fast median
	fastMedianStartingPixel = (videoWidthScaled * halfOfTheMaskSize + halfOfTheMaskSize)<<2, // pixel to start from when performing fast median
	medianMaskSizeTimesFourTimesWidth = videoWidthScaled*medianMaskSizeTimesFour;
	scalingFactor = videoWidth/videoWidthScaled;
	medianMaskSizeTimesScalingFactor = medianMaskSize * scalingFactor;
	medianMaskSizeDivTwoTimesScalingFactor = medianMaskSizeTimesScalingFactor >> 1;
	videoWidthMinusOne = videoWidth-1;
	//
	
		
	// initialize 2D contextes
	left_canvas_ctx = left_canvas.getContext('2d');
	right_canvas_ctx = right_canvas.getContext('2d');
	displayLeftVideoDownscaledContext = displayLeftVideoDownscaled.getContext('2d');
	displaySubtractedBackgroundContext = displaySubtractedBackground.getContext('2d');
	displayForegroundthresholdContext = displayForegroundthreshold.getContext('2d');
	displayMedianContext = displayMedian.getContext('2d');
	displayMedianEdgesContext = displayMedianEdges.getContext('2d');
	displayGradientContext = displayGradient.getContext('2d');
	displayNoBackgroundContext = displayNoBackground.getContext('2d');
	displayPhotoContext = displayPhoto.getContext('2d');

}

/*
*	Serializes ball object and sends it to another player screen 
*/
function sendBallToAnotherScreen(ball){

	ballRadius = ball.radius;

	var json = {'ball':{
		'x': ball.state.pos.x,
		'y': ball.state.pos.y,
		'vx': ball.state.vel.x,
		'vy': ball.state.vel.y,
		'radius': ballRadius,
		'mass': ball.mass,
		'color': ball.styles.fillStyle
	}};

	sendData(json);
}

/*
*	Insert bouncing physics to a ball
*/
function insertPhysics(){

	var streamWidth = $('.stream').width()*2;
	var streamHeight = $('.stream').height()-25;
	
	var videoHeightMinusBallRadius = videoHeight - ballRadius;
	
	// because physicsJS is not perfect, the collision is reported a few moments after it actually happened and the ball bounces back
	var videoHeightMinusBallRadiusMinus10 = videoHeightMinusBallRadius - 10;
	var videoHeightDivTwo = videoWidth >> 1;
	videoWidthDivTwo = videoWidth >> 1;

	Physics(function(world){
	   var renderer = Physics.renderer('canvas', {
		    el: 'viewport', // id of canvas element
		    meta: true,
		    width: streamWidth,
		    height: streamHeight
		});
		world.add(renderer);
		
		// volleyball net
		var gNet = Physics.body('rectangle', {
			labels: [labelNet],
		    x: videoWidth,
		    y: videoHeightDivTwo,
			width: 10,
			height: videoHeightDivTwo,
			cof: 0.8,
            restitution: 0.8,
		    treatment: 'static',
		    styles: {
                fillStyle: '#83F52C', // bright green
				strokeStyle: 'rgba(0, 0, 0, 1.0)',
				lineWidth: 3
            }
		});
		
		world.add(gNet);
		// end volleyball net
		
		world.render();

		// subscribe to ticker to advance the simulation
		Physics.util.ticker.on(function(time, dt){
		    world.step(time);
		});

		Physics.util.ticker.start();

		world.on('step', function(){
		    world.render();
		});

		// define bounds of physics
		var bounds = Physics.aabb($('#viewport').position().left, 
								  -600,
								  $('#viewport').width(), 	// right line for ball to zone out
								  $('#viewport').height());	// bottom line for ball to zone out

		world.add([	Physics.behavior('constant-acceleration', {
					        acc: { 
					        	x : 0, 
					        	y: 0.0004 // gravity 
					        } 
					    }),
					Physics.behavior('edge-collision-detection', {
					    restitution: 1.0,
        				cof: 0.99,
					    aabb: bounds
					}),
				   	Physics.behavior('body-impulse-response'),
				   	Physics.behavior('body-collision-detection'),
				   	Physics.behavior('sweep-prune')
				  ]);
		
		// query for collision of the human with the ball
		var query = Physics.query({
			$or: [
				{ bodyA: { labels: labelHuman }, bodyB: { labels: labelBall } }
				,{ bodyB: { labels: labelHuman }, bodyA: { labels: labelBall } }
			]
		});

		world.on('collisions:detected', function(data, e){
			
			var ballObjSearch = {
			    name: 'circle',
			    labels: [labelBall]
			};
			var ballObjArr = gWorld.find(ballObjSearch);
			var ballObj = ballObjArr[0];

			// check if ball touched the ground
			if(ballObj.state.pos.y >= videoHeightMinusBallRadiusMinus10){ // the collision is reported asynchronously so we have to give it a threshold of 10
				if(ballObj.state.pos.x < left_canvas.width){
					// if the ball fell on the left part of the ground, right player scored
					if(leftIsLocalStream){
						refreshScores(leftPlayerScore, ++rightPlayerScore);
						notifyOponentScoreValues(leftPlayerScore, rightPlayerScore);
						checkWinnerAndInsertBall();
					}
				} else{
					// if the ball fell on the right part of the ground, left player scored
					if(!leftIsLocalStream){
						refreshScores(++leftPlayerScore, rightPlayerScore);
						notifyOponentScoreValues(leftPlayerScore, rightPlayerScore);
						checkWinnerAndInsertBall();
					}
				}
			}
			else{
				notifyBumsSound();
				bumsSound.play();
				// detect collision of ball with the human
				var found = Physics.util.find( data.collisions, query );
				if ( found ){
					// give the ball an acceleration towards the diagonale to the top right corner
					var accelerationToRight = 10;

					// give the ball a slight acceleration towards the upper right corner
					// thus making it easier to play
					var xVelocity;
					if(leftIsLocalStream){
						xVelocity = ballObj.state.vel.x + 0.2;
					}else{
						xVelocity = ballObj.state.vel.x - 0.2; 
					}
					var yVelocity = ballObj.state.vel.y - 0.2
					;
					var newSpeed = calculateSpeed(xVelocity, yVelocity);
					// newSpeed should not exceed max speed
					if(newSpeed > maxSpeedAllowed){
						var factor = maxSpeedAllowed/newSpeed;
						xVelocity*=factor;
						yVelocity*=factor
					}
					
/* 					// FOR DEBUG PURPOSES ONLY
					if(newSpeed > maxSpeedSoFar){
						maxSpeedSoFar = newSpeed;
						console.log("MAX SPEED SO FAR " + maxSpeedSoFar);
					}
					// END FOR DEBUG PURPOSES ONLY */
					
					ballObj.state.vel.set(xVelocity, yVelocity);
					
				}
				// START SYNCING
				if(leftIsLocalStream){
				// ball is on left side
					if(ballObj.state.pos.x <= left_canvas.width){
						// serialize object and send it to other player
						sendBallToAnotherScreen(ballObj);
					}
				}else{
						// ball is on right side
						if(ballObj.state.pos.x > left_canvas.width){
							// serialize object and send it to other player
							sendBallToAnotherScreen(ballObj);
						}
				}
				// END SYNCING
			}
			
	    });

	    gWorld = world;

	});
}



function initEvents() {

	if(callIDParameter){
		makeCall(false);
	}

    $('#calibrate').on('click', function(){
    	calibrate(displayLeftVideoDownscaled, displayPhoto);
    	return false;
    });

    $('.make-call').on('click', function(){
    	makeCall(true);
    	return false;
    });
	
	// insert the ball when play button has been clicked
	$('#play').on('click', function(){
		disablePlayButton();
		if($('#play').text() == stringRestart){
			if(leftIsLocalStream){
				// master wants restart
				startGame();
			}else{
				lastBallStartOnLeft = leftIsLocalStream;
				notifyMasterRestartRequested();
			}
		} else{ // the buttons is not a restart button
			if(leftIsLocalStream){
				// if slave is ready, start the game
				if(isSlaveReady){
					startGame();
				} else{
					isMasterReady = true;
					renamePlayButton(stringWaitingForOtherPlayer);
				}
			} else{
				// notify master that we are ready
				renamePlayButton(stringWaitingForOtherPlayer);
				notifyMasterIAmReady();
			}
		}

		return false;
    });
}

/*
Performs the calibration for background subtraction.
It basically takes a photo from the feedCanvas of the current camera which is later used for the subtraction.
The photo is pushed to the provided targetCanvas.
After that, the PLAY button gets enabled so the player can start the game.
*/
function calibrate(feedCanvas, targetCanvas) {
	var feedCanvasContext = feedCanvas.getContext('2d');
	var targetCanvasContext = targetCanvas.getContext('2d');
	subtractionPhoto = feedCanvasContext.getImageData(0, 0, feedCanvas.width, feedCanvas.height);
	targetCanvasContext.putImageData(subtractionPhoto, 0, 0);
	isCalibrated = true;
	if((typeof remote_video_stream) != 'undefined'){
		var newLabel = stringPlay;
		if($('#play').text() == stringRestart)
			newLabel = stringRestart; // if the button is set on "restart" do not rename it to "play!"
		enablePlayButton();
		renamePlayButton(newLabel);
	}else{
		renamePlayButton("no oponent");
	}
}


// *************************************
// IMAGE PROCESSING FUNCTIONS BEGIN HERE
// *************************************

var medianMaskSize = 5, // the size of the mask for the median filter (2d box)
	thresholdValue = 10, // initial value of the segmentaion threshold
	halfOfTheMaskSize = Math.floor(medianMaskSize >> 1),
	halfOfTheMaskSquare = Math.floor(((medianMaskSize*medianMaskSize) >> 1)),
	medianMaskSizeTimesFour = medianMaskSize << 2,
	skip, // number of pixels to skip when performing fast median
	fastMedianStartingPixel, // pixel to start from when performing fast median
	medianMaskSizeTimesFourTimesWidth;

var subtractionPhoto; // the photo which is used for background subtraction, type: ImageData

/*
 * This function is invoked once on every frame of the camera. The content of this function is for image processing.
 */
function refresh(){

	var originalImageData,
		imageDataSubtracted,
		medianImageData,
		medianEdgeImageData,
		imageDatathreshold,
		result;

	drawVideoToCanvas();
	if(typeof subtractionPhoto != 'undefined'){
		originalImageData = displayLeftVideoDownscaledContext.getImageData(0, 0, displayLeftVideoDownscaled.width, displayLeftVideoDownscaled.height);
		
		if(typeof subtractionPhoto != 'undefined'){
			imageDataSubtracted = subtract(originalImageData, subtractionPhoto);
			medianImageData = displayMedianContext.getImageData(0, 0, displayMedian.width, displayMedian.height);
			medianEdgeImageData = displayMedianEdgesContext.createImageData(displayMedianEdges.width, displayMedianEdges.height);
			displaySubtractedBackgroundContext.putImageData(imageDataSubtracted, 0, 0);
				
			imageDatathreshold = thresholdImage(imageDataSubtracted, thresholdValue);
				
			result = fastMedianFilter(originalImageData, medianImageData, medianEdgeImageData, medianMaskSize);
			medianImageData = result[0];
			medianEdgeImageData = result[1];
			displayMedianContext.putImageData(medianImageData, 0, 0);
			displayMedianEdgesContext.putImageData(medianEdgeImageData, 0, 0);

			displayForegroundthresholdContext.putImageData(imageDatathreshold, 0, 0);
	
			//**** BEGIN CREATE HUMAN *****//
			/****** I am generous god! *****/
			
			// add new squares to the world
			var push = Array.prototype.push,
				hCoordsLength = humanCoordinates.length;
			
			var offset = 0;	
			if(!leftIsLocalStream){
				offset = left_canvas.width;
			}

			var aCoordinate,
				aCoordinateDivFour,
				aCoordinateDivFourTimesScalingFactor,
				xSquare,
				ySquare,
				gSquare;

			for(var i=0; i<hCoordsLength; i++){
				// each coordinate is a centroid of the square
				// use medianMaskSize, scaledWidth and scaling factor to determine x,y coordinates on the big canvas
				aCoordinate = humanCoordinates[i];
				aCoordinateDivFour = aCoordinate >> 2;
				aCoordinateDivFourTimesScalingFactor = aCoordinateDivFour*scalingFactor;
				
				// x-axis on PhysicsJS == mirrored y-axis on Canvas
				xSquare = videoWidthMinusOne - (aCoordinateDivFour % videoWidthScaled)*scalingFactor; // x-coordinate of squares centroid
				// y-axis on PhysicsJS == x-axis on Canvas
				ySquare = Math.floor(aCoordinateDivFourTimesScalingFactor/videoWidthScaled)+animationOffset; // y-coordinate of squares centroid
				
				
				// gHumanSquares.length can be increase if a new object is added in this loop.
				if(i < gHumanSquares.length){
					gSquare = gHumanSquares[i];
					gSquare.state.pos.x = xSquare + offset;
					gSquare.state.pos.y = ySquare;
					gSquare.hidden = false;
				}else{
					// create physics object
					gSquare = Physics.body('circle', {
						labels: [labelHuman],
						radius: medianMaskSizeDivTwoTimesScalingFactor,
						treatment: 'static',
						x: xSquare + offset,
						y: ySquare,
						cof: 0.8,
						restitution: 1.0, // bounce
						styles: {
							fillStyle: 'rgba(181, 137, 0, 0.4)' // this is color '#b58900'
							//angleIndicator: '#624501'
						}
					});

					
					gWorld.add(gSquare);
					push.apply(gHumanSquares, [gSquare]);
				}
			}
			
			var gHumanLength = gHumanSquares.length;
			if(hCoordsLength < gHumanLength){
				for(var i=hCoordsLength; i < gHumanLength; i++){
					gSquare = gHumanSquares[i];
					gSquare.state.pos.x = 0;
					gSquare.state.pos.y = 0;
					gSquare.hidden = true;
				}
			}
		}
	}
	
}


/*
Returns an image data that is equal to imageDataA - imageDataB without subtracting the alpha channel.
This function may be used for subtracting background from an image.
If a value of a rbg in pixelA > pixelB the resulting component's value will be pixelB-pixelA.
This function assumes that provided arguments have equal size.
*/
function subtract(imageDataA, imageDataB) {
	
	var imageDataAData = imageDataA.data,
		imageDataBData = imageDataB.data, 
		imageLength = imageDataAData.length/4;
		
	for (var i=0; i<imageLength; i++){
		for (var j=0; j<3; j++){ // skip alpha
			if(imageDataAData[i*4+j] < imageDataBData[i*4+j])
				imageDataAData[i*4+j] = imageDataBData[i*4+j] - imageDataAData[i*4+j];
			else
				imageDataAData[i*4+j]-=imageDataBData[i*4+j];
		}
	}
	return imageDataA;
}


/*
* Implementation of the Real-Time Median Filter - Zhao and Taubin 2006.
* It does not apply the mask on all four channels but only on the red one.
* The result of the filter is then applied to red green and blue, alpha will be set to 255.
* This function assumes that medianMaskSize is an uneven number.
*/
function fastMedianFilter(imageDataSource, imageDataTarget, imageDataTargetEdges, medianMaskSize) {

	humanCoordinates = []; // flush the previous coordinates
	var blocks = [];  // contains coordinates of all block centers in the image
	var imageDataTargetDataLength = imageDataTarget.data.length,
		lastCoordinate = imageDataTargetDataLength - 1,
		push = Array.prototype.push;
	//var imageDataTargetDataLengthTimesFour  = imageDataTargetDataLength << 2;

	var middlePixelCoordinate,
		iDividedFour,
		numberOfWhites,
		imageDataTargetWidth,
		pixelsUnderTheMask,
		calcOpt1,
		pixelCoordinate,
		aPixel,
		pixelsUnderTheMaskLength,
		aPixelUnderTheMask,
		currentHorizontalPosition,
		nextHorizontalPosition;

	for(var i= fastMedianStartingPixel, end=imageDataTargetDataLength; i<end; i+=medianMaskSizeTimesFour){
		
		middlePixelCoordinate = i;
		iDividedFour = i >> 2;
		numberOfWhites = 0;
		imageDataTargetWidth = imageDataTarget.width;

		pixelsUnderTheMask = [];
		
		for (var k=0; k<medianMaskSize; k++){ // row or y
			// compute this here, not in each second loop iteration
			calcOpt1 = (k-halfOfTheMaskSize)*imageDataTargetWidth;

			for(var l=0; l<medianMaskSize; l++){ // column or x
				
				// calculate the coordinate of the next pixel in the mask
				pixelCoordinate = middlePixelCoordinate + ((calcOpt1 + l-halfOfTheMaskSize) << 2);
				
				if(pixelCoordinate < 0 || pixelCoordinate > lastCoordinate){
					// we need to mirror because we are at the edge of the picture
					pixelCoordinate = middlePixelCoordinate;
				}

				aPixel = imageDataSource.data[pixelCoordinate];
				pixelsUnderTheMask.push(pixelCoordinate);
				if(aPixel)
					numberOfWhites++; // we have white pixel
			}
		}
		blocks.push(pixelsUnderTheMask);
		
		// redundancy but more efficient
		pixelsUnderTheMaskLength = pixelsUnderTheMask.length;
		if (numberOfWhites > halfOfTheMaskSquare){
			//humanCoordinates.push(middlePixelCoordinate);
			for(var m=0; m <  pixelsUnderTheMaskLength; m++){
				aPixelUnderTheMask = pixelsUnderTheMask[m];
				// white pixels are the majority
				imageDataTarget.data[aPixelUnderTheMask] = imageDataTarget.data[aPixelUnderTheMask + 1] = imageDataTarget.data[aPixelUnderTheMask + 2] = 255;
				imageDataTarget.data[aPixelUnderTheMask + 3]  = 255; // alpha
			}
		} else{
			for(var m=0; m <  pixelsUnderTheMaskLength; m++){
				aPixelUnderTheMask = pixelsUnderTheMask[m];
				// white pixels are the majority
				imageDataTarget.data[aPixelUnderTheMask] = imageDataTarget.data[aPixelUnderTheMask + 1] = imageDataTarget.data[aPixelUnderTheMask + 2] = 0;
				imageDataTarget.data[aPixelUnderTheMask + 3]  = 255; // alpha
			}
		}
	
		// check if we are at the end of the line, if so, we need to skip some lines beacuse the width of the mask should be
		// taken into account
		imageDataTargetWidth = imageDataTarget.width;
		currentHorizontalPosition = (iDividedFour) % imageDataTargetWidth;
		nextHorizontalPosition = ((iDividedFour) + medianMaskSize) % imageDataTargetWidth;

		if(nextHorizontalPosition <= currentHorizontalPosition){
			// we have a line switch, skip some lines
			i+=skip;
		}
		
		
	}
	
	// determine edge pixels (an edge pixel is a pixel that has at least one 8-neighbor that is different)
	var edgeBlocks = [],
		blocksLength = blocks.length,
		wholeBlock,
		blockPixel,
		blockPixelValue,
		edgeBlockFound,
		temp,
		aNeighbor,
		edgeBlocksLength,
		anEdgeBlock,
		aPixelCoordinate;

	for(var i=0; i < blocksLength; i++){
		wholeBlock = blocks[i];
		blockPixel = wholeBlock[halfOfTheMaskSquare];
		blockPixelValue = imageDataTarget.data[blockPixel];

		if(blockPixelValue == 0)
			continue; // skip the black blocks

		edgeBlockFound = false;
		// now check the neighbors
		for(var j=-1; j<2; j+=2){ // row
			if(edgeBlockFound)
				break; // an edge pixel is already confirmed, no need to look more
			temp = blockPixel + j*medianMaskSizeTimesFourTimesWidth;

			for(var k=-1; k<2; k+=2){ // column
				aNeighbor = temp + k*medianMaskSizeTimesFour;

				if (aNeighbor < 0 || aNeighbor > lastCoordinate)
					continue; // we fell of the edge
				if(blockPixelValue != imageDataTarget.data[aNeighbor]){
					//we have found an edge pixel
					humanCoordinates.push(blockPixel); // the edge pixel belongs to a human (still a human)
					edgeBlocks.push(wholeBlock);
					edgeBlockFound = true;
					break;
				}
			}
		}
	}
	
	// push edge blocks to imageDataTargetEdges if provided
	if(imageDataTargetEdges != 0){
		edgeBlocksLength = edgeBlocks.length;
		
		for(var i=0; i < edgeBlocksLength; i++){
			anEdgeBlock = edgeBlocks[i];
			anEdgeBlockLength = anEdgeBlock.length;
			
			for(var j=0; j < anEdgeBlockLength; j++){
				aPixelCoordinate = anEdgeBlock[j];
				imageDataTargetEdges.data[aPixelCoordinate] = imageDataTargetEdges.data[aPixelCoordinate + 1] = imageDataTargetEdges.data[aPixelCoordinate + 2] = 0;
				imageDataTargetEdges.data[aPixelCoordinate + 3]  = 255; // alpha
			}
		}
	}
	
	return [imageDataTarget, imageDataTargetEdges];
}

/*
Consumes imageData and a threshold.
The returned imageData has all pixel with all rgb components' values < threshold set to black (0 0 0) and all other pixels set to white (255 255 255).
*/
function thresholdImage(imageDataResult, threshold){
	var imageDataResultData = imageDataResult.data,
		imageDataResultDataLength = imageDataResultData.length,
		rCoordinate,
		gCoordinate,
		bCoordinate;

	for (var i=0; i<imageDataResultDataLength; i+=4){
		rCoordinate = i;
		gCoordinate = rCoordinate + 1;
		bCoordinate = gCoordinate + 1;
		//var grayValue = calculateGrayValue(imageDataResult.data[i*4], imageDataResult.data[i*4+1], imageDataResult.data[i*4+2]);
		if(imageDataResultData[rCoordinate] < threshold && imageDataResultData[gCoordinate] < threshold && imageDataResultData[bCoordinate] < threshold) {
			imageDataResultData[rCoordinate] = imageDataResultData[gCoordinate] = imageDataResultData[bCoordinate] = 0;
		}else{
			imageDataResultData[rCoordinate] = imageDataResultData[gCoordinate]= imageDataResultData[bCoordinate] = 255;
		}
	}
	return imageDataResult;
}

/*
Calculates the gray value from provided RGB values and returns it.
*/
function calculateGrayValue(red, green, blue){
	return Math.round(0.299*red + 0.587*green + 0.114*blue);
}

// *************************************
// IMAGE PROCESSING FUNCTIONS END HERE
// *************************************

/*
 * Writes the new scores on the screen.
 * @param leftPlayerScore score of the left player
 * @param rightPlayerScore score of the right player
 */
function refreshScores(newLeftPlayerScore, newRightPlayerScore){
	$('#leftPlyerSpan').text(newLeftPlayerScore);
	$('#rightPlayerSpan').text(newRightPlayerScore);
}

/*
 Enables the play button with the id="play"
*/
function enablePlayButton(){
	$('#play').prop('disabled', false);
}

/*
 Disables the play button with the id="play"
*/
function disablePlayButton(){
	$('#play').prop('disabled', true);
}

/*
 Enables the play button with the id="play"
*/
function renamePlayButton(newLabel){
	$('#play').text(newLabel);
}

/*
 Adds the ball to the world. To be invoked when the game starts.
 If insertToLeftPlayer is true, the ball will be inserted to the left player. Else the ball will be inserted to the right player
*/
function insertBall(insertToLeftPlayer){
	
	// get attention of players 
	pfiffSound.play();

	// BALL SETTINGS
	var ballStartPositionX;
	if(insertToLeftPlayer)
		ballStartPositionX = videoWidthDivTwo; // ball on the left side of the field
	else
		ballStartPositionX = videoWidth + videoWidthDivTwo; // ball on the right side of the field
	var ballStartPositionY = 0;
	var ballXVelocity = 0.0;
	var ballYVelocity = 0.0;
	var ballMass = 1.0;
	var ballColor = '#ff0000';

	var ballObjSearch = {
	    name: 'circle',
	    labels: [labelBall]
	};
	var ballObjArr = gWorld.find(ballObjSearch);
	var ballObj = ballObjArr[0];
	var ballFoundOnField = ballObjArr.length > 0;

	if(ballFoundOnField){
		// just edit ball coordinates
		ballObj.state.pos.x = ballStartPositionX;
		ballObj.state.pos.y = ballStartPositionY;
		ballObj.state.vel.x = ballXVelocity;
		ballObj.state.vel.y = ballYVelocity;

	}else{
		// no ball found -> add one
		var gBall = Physics.body('circle', {
				labels: [labelBall],
			    x: 		ballStartPositionX,
			    y: 		ballStartPositionY,
			    vx: 	ballXVelocity,
			    vy: 	ballYVelocity,
				cof: 0.8,
	            restitution: 1.00,
			    radius: ballRadius,
			    //mass: 	ballMass,
			    treatment: 'dynamic',
			    styles: {
	                fillStyle: ballColor
					,angleIndicator: '#751b4b'
	            }
			});
			
		// give the ball some skin
		gBall.view = new Image();
		gBall.view.src = 'img/volleyball_scaled.png';

		gWorld.add(gBall);
	}
}

/*
Does the same like insertBall() but inserts the ball with the delay specified by countdownSeconds.
During the delay, a countdown is shown to the players.
The element with id="countdown" is used for displaying.
Additionally it restarts scores.
*/
function insertBallDelayed(insertToLeftPlayer, countdownSeconds){

	// clear any previous timers
	if(countdownTimerID != 'undefined')
		clearInterval(countdownTimerID);
	
	// start counting
	var countdown = $('#countdown');
	countdown.text(countdownSeconds--);
	
	countdownTimerID = setInterval(function () {
		switch(countdownSeconds) {
			case 0:
				countdown.text("GO!");
				countdownSeconds--
				break;
			case -1:
				clearInterval(countdownTimerID);
				countdown.text("");
				insertBall(insertToLeftPlayer);
				break;
			default:
				countdown.text(countdownSeconds--);
		}
    }, 1000);

	// now reinitialize variables for eventual game restart.
	isSlaveReady = false;
	isMasterReady = false;
	refreshScores(leftPlayerScore = 0, rightPlayerScore = 0);
	renamePlayButton(stringRestart);
	enablePlayButton();
}

/*
Removes ball from field (if present).
*/
function removeBallFromField(){
	var ballObjSearch = {
	    name: 'circle',
	    labels: [labelBall]
	};
	var ballObjArr = gWorld.find(ballObjSearch);
	if(ballObjArr.length > 0){
		gWorld.remove(ballObjArr[0]);
	}
}

/*
Sends a predefined message to another player that the game is commencing. The countdown should be started.
This message is only sent by the master (left player).
ENCODINGS FOR gameState
1 - game commencing
2 - slave is ready
3 - slave requested restart
4 - command to play bums sound on opponent
5 - sync scores
*/
function notifyOtherPlayerBallInField(){
	var json = {'gameState':1};
	sendData(json);
}

/*
Notifies master that slave (me) is redy to play.
*/
function notifyMasterIAmReady(){
	var json = {'gameState':2};
	sendData(json);
}

/*
Notifies master that slave requested restart (sent only by slave).
*/
function notifyMasterRestartRequested(){
	var json = {'gameState':3};
	sendData(json);
}

/*
Notifies opponent to play bumsSound.
*/
function notifyBumsSound(){
	var json = {'gameState':4};
	sendData(json);
}

/*
Notify oponent about score values I have.
*/
function notifyOponentScoreValues(scoreLeft, scoreRight){
	var json = {'gameState':5 ,
				'scoreLeft': scoreLeft,
				'scoreRight': scoreRight
	};
	sendData(json);
}

/*
Starts the game (invoked by master only).
In particular, it notifies the slave, inserts the ball on master and renames the playButton.
*/
function startGame(){
	lastBallStartOnLeft = leftIsLocalStream;
	notifyOtherPlayerBallInField();
	insertBallDelayed(lastBallStartOnLeft, countdownDuration);
	renamePlayButton(stringRestart);
}

/*
Renames play button with newLabel and enables it.
*/
function renameButtonToPlayAndEnableIt(newLabel){
	renamePlayButton(newLabel);
	enablePlayButton();
}

/*
* 	Consumes speed in x and y direction and returns its total.
*/
function calculateSpeed(speedX, speedY){
	return Math.sqrt(speedX*speedX+speedY*speedY);
}

/*
* 	Checks for a winner and displays information
*/
function checkWinnerAndInsertBall(){
	
	var countdown = document.getElementById('countdown');
	if(leftPlayerScore >= maxScore){
		// left has won
		removeBallFromField();
		if(leftIsLocalStream){
			countdown.innerHTML = "YOU WON!";
			ovationSound.play();
		}else{
			countdown.innerHTML = "YOU LOST!";
			booSound.play();
		}
	} else if(rightPlayerScore >= maxScore){
		// right player has won
		removeBallFromField();
		if(!leftIsLocalStream){
			countdown.innerHTML = "YOU WON!";
			ovationSound.play();
		}else{
			countdown.innerHTML = "YOU LOST!";
			booSound.play();
		}
	} else{
		// no winner, insert the ball again
		insertBall(lastBallStartOnLeft = ! lastBallStartOnLeft);
	}
	// END CHECKING FOR WINNER
}

/*
*	Returns hashmap of url parameters and their values back
*/
function getUrlParams(){
    
    var vars = [], 
    	param,
    	params = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    
    for(var i=0; i<params.length; i++){
        param = params[i].split('=');
        vars.push(param[0]);
        vars[param[0]] = param[1];
    }

    return vars;
}
