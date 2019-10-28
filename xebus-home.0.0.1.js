/**
 * Copyright (C) 2018 Majormode.  All rights reserved.
 *
 * This software is the confidential and proprietary information of
 * Majormode or one of its subsidiaries.  You shall not disclose this
 * confidential information and shall use it only in accordance with the
 * terms of the license agreement or other applicable agreement you
 * entered into with Majormode.
 *
 * MAJORMODE MAKES NO REPRESENTATIONS OR WARRANTIES ABOUT THE SUITABILITY
 * OF THE SOFTWARE, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
 * PURPOSE, OR NON-INFRINGEMENT.  MAJORMODE SHALL NOT BE LIABLE FOR ANY
 * LOSSES OR DAMAGES SUFFERED BY LICENSEE AS A RESULT OF USING, MODIFYING
 * OR DISTRIBUTING THIS SOFTWARE OR ITS DERIVATIVES.
 */

'use strict';

/**
 * Default duration of a booking period.
 */
const DEFAULT_BOOKING_DURATION = 1;

/**
 * The location acquisition process failed  because the document does
 * not have permission to use the Geolocation API.
 */
const GEOLOCATION_ERROR_PERMISSION_DENIED = 1;

/**
 * The position of the device could not be determined.  For instance,
 * one or more of the location providers used in the location acquisition
 * process reported an internal error that caused the process to fail
 * entirely.
 */
const GEOLOCATION_ERROR_POSITION_UNAVAILABLE = 2;

/**
 * The length of time specified by the ``timeout``property has elapsed
 * before the implementation could successfully acquire a new
 * ``Position`` object.
 */
const GEOLOCATION_ERROR_TIMEOUT = 3;

/**
 * Identifier for the HTML element containing the map.
 */
const MAP_HTML_ELEMENT_ID = 'map__canvas';

/**
 * Default resolution at which to display the map that shows the current
 * location of the user.
 */
const MAP_ZOOM_DEFAULT_LEVEL = 13;

/**
 * Resolution at which to display the map that is focus to a selected
 * sports center.
 */
const MAP_ZOOM_CLOSEUP_LEVEL = 15;

/**
 * Represent the different states of access of the user's location
 * information.
 */
const USER_LOCATION_INFORMATION_ACCESS_STATE = new enums.Enum(
  // The user has explicitly denied permission for the current origin to
  // access location information of the device.
  'denied',

  // The user has explicitly granted permission for the current origin
  // to access location information of the device.
  'granted',

  // The user decision is unknown; the user agent will be asking the
  // user’s permission if the caller tries to access the location
  // information of the device.
  'prompt',

  // The user agent doesn't support the Permission API.  The permission
  // state of access to the location information of the device is unknown.
  'unknown',

  // The user agent doesn't support the GeoLocation API.  It cannot provide
  // location information of the device.
  'unavailable'
);

/**
 * Date and time of the beginning of the booking period as defined by the
 * user.
 */
let mBookingStartDateTime = null;

/**
 * Date and time of the end of the booking period as defined by the user.
 */
let mBookingEndDateTime = null;

/**
 * Identification of the sports center currently highlighted in the
 * selection list panel, i.e., the sports center that the mouse cursor is
 * currently over.
 */
let mHighlightedSportsCenterId = null;

/**
 * Indicate whether the user's location information is being acquired.
 * This flag prevents from concurrent user current location update
 * requests (cf. function ``updateUserCurrentLocation``).
 */
let mIsUserCurrentLocationUpdateInProgress = false;

/**
 * Instance of Google Maps used to display sports centers near the
 * location of the user.
 */
let mMap = null;

/**
 * Sport currently selected by the user.
 */
let mSelectedSport;

/**
 * Identification of the sports center that the user has selected.
 */
let mSelectedSportsCenterId = null;

/**
 * Cache of sports centers downloaded from the server platform.  It
 * corresponds to a dictionary where the key represents the
 * identification of a sport center and the value represents the sports
 * center instance.
 */
let mSportsCenters = {};

/**
 * A view of cached sports centers grouped by sport.  It corresponds to
 * a dictionary where the key represents a sport, such as "badminton",
 * "tennis", etc., and the value represents a list of sports center
 * instances.
 */
let mSportsCentersBySport = {};

/**
 * Dictionary of polylines corresponding to the route from the user's
 * current location to the entrance of a sport center.  The key
 * represents the identification of a sport center and the value
 * represents the Google Maps polyline instance.
 */
let mSportsCenterRoutePolylines = {};

/**
 * An instance ``google.maps.LatLng`` representing the user's current
 * location.
 */
let mUserCurrentLocation = null;

/**
 * Accuracy expressed in meters of the user's current location.
 */
let mUserCurrentLocationAccuracy = null;

/**
 * An instance ``google.maps.Marker`` identifying the user's current
 * location on the map.
 */
let mUserCurrentLocationMarker = null;




/**
 * Stop playing the rotation animation to the specified HTML element.
 *
 *
 * @param element: a HTML element to stop play the rotation animation to.
 */
function disabledRotationAnimation(element) {
  element.removeClass('animate--rotate');
}



function displayUserCurrentLocation(position, accuracy) {
  // We don't use ``google.maps.Circle`` as it doesn't draw a perfect
  // circle, but an approximate circle shape.  We rather prefer to use a
  // built-in circle symbol SVG path.
  let icon = {
    anchor: new google.maps.Point(0,0),
    fillColor: '#4388e7',
    fillOpacity: 0.3,
    path: google.maps.SymbolPath.CIRCLE,
    scale: Math.round(mUserCurrentLocationAccuracy / getApproximateMetersPerPixel(mMap, mUserCurrentLocation)),
    strokeColor: '#4388e7',
    strokeOpacity: 0.4,
    strokeWeight: 2,
  };

  // Create an instance ``google.maps.Marker`` or update the cached
  // instance.
  if (mUserCurrentLocationMarker == null) {
    mUserCurrentLocationMarker = new google.maps.Marker({
      draggable: false,
      icon: icon,
      map: mMap,
      position: position,
      zIndex : -20,
    });

    // We need to scale the built-in circle symbol SVG path when the map
    // panorama's zoom level changes.
    mMap.addListener('zoom_changed', function (event) {
      onMapZoomChanged();
    });
  } else {
    mUserCurrentLocationMarker.setPosition(position);
    mUserCurrentLocationMarker.setIcon(icon);
  }
}



function enableRotationAnimation(element) {
  element.addClass('animate--rotate');
}



function initializeHomePage() {
  
  initializeUserLocationRequestButton();

}


function initializeMap() {
  // Default location to display on the map when the current location of
  // the user cannot be determined from his IP address.
  var DEFAULT_LOCATION = new google.maps.LatLng(10.768451, 106.6943626);

  // Retrieve the current location of the user as determined by the
  // platform from the user's IP address when loading the homepage, of
  // fallback to default location.
  var mUserCurrentLocation = (typeof PAGE_CONTEXT === 'undefined' || typeof PAGE_CONTEXT.user_location === 'undefined') ? DEFAULT_LOCATION
      : new google.maps.LatLng(PAGE_CONTEXT.user_location.latitude, PAGE_CONTEXT.user_location.longitude);

  // Style the map to not show points of interest usually added by Google.
  var mapStyles = [
    {
      featureType: 'poi',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }]
    },
    {
      featureType: 'transit',
      elementType: 'labels.icon',
      stylers: [{ visibility: 'off' }]
    },
    {
      stylers: [ { saturation: -100 } ]
    }
  ];

  // Define the various options of the map.
  var mapOptions = {
    center: mUserCurrentLocation,
    fullscreenControl: false,
    mapTypeControl: false,
    mapTypeId: google.maps.MapTypeId.TERRAIN,
    navigationControl: false,
    overviewMapControl: false,
    panControl : false,
    rotateControl: false,
    scaleControl: false,
    scrollwheel: false,
    streetViewControl: false,
    styles: mapStyles,
    zoom: MAP_ZOOM_DEFAULT_LEVEL,
    zoomControl: true,
    zoomControlOptions: {
      style: google.maps.ZoomControlStyle.SMALL,
      position: google.maps.ControlPosition.RIGHT_CENTER
    }
  }

  // Initialize the map with the given styles and options.
  mMap = new google.maps.Map(document.getElementById(MAP_HTML_ELEMENT_ID), mapOptions);

//  // Wait for the map is completely loaded to trigger resize to correctly
//  // display the map, otherwise the map would show up but empty.
//  google.maps.event.addListenerOnce(mMap, 'idle', function () {
//    google.maps.event.trigger(mMap, 'resize');
//  });

  mMap.addListener('bounds_changed', function (event) {
    onMapBoundsChanged();
  });
}


/**
 * Initialise the button that allows to select another sport.
 */
function initializeUserLocationRequestButton() {
  // Initialise the state of the button used to request the user's location
  // information depending on whether the access to this information is
  // granted or not, or whether the access permission is still unknown.
  requestUserLocationInformationAccessState().then(function (state) {
    switch (state) {
      case USER_LOCATION_INFORMATION_ACCESS_STATE.prompt:
      case USER_LOCATION_INFORMATION_ACCESS_STATE.unknown:
        setUserLocationRequestButtonIcon('compass');
        enableRotationAnimation($('#searchLocationButton'));
        showToast(gettext('home.toast.info.request_location_information_access'));
        break;

      case USER_LOCATION_INFORMATION_ACCESS_STATE.granted:
        setUserLocationRequestButtonIcon('pending');
        updateUserCurrentLocation();
        break;

      case USER_LOCATION_INFORMATION_ACCESS_STATE.denied:
      case USER_LOCATION_INFORMATION_ACCESS_STATE.unavailable:
        setUserLocationRequestButtonIcon('unavailable');
        break;
    }
  });

  // Add a listener to the button used to initiate the acquisition of the
  // user's current location.  Prevent from multiple clicks within a short
  // period of time.
  let userLocationRequestButtonIcon = $('#searchLocationButton');
  userLocationRequestButtonIcon.on('click', debounce(function () {
    onUserLocationRequestButtonClicked();
  }, 2000, true));
}



function onUserLocationRequestButtonClicked() {
  requestUserLocationInformationAccessState().then(function (state) {
    switch (state) {
      case USER_LOCATION_INFORMATION_ACCESS_STATE.prompt:
      case USER_LOCATION_INFORMATION_ACCESS_STATE.unknown:
      case USER_LOCATION_INFORMATION_ACCESS_STATE.granted:
        setUserLocationRequestButtonIcon('pending');
        disabledRotationAnimation($('#searchLocationButton'));
        updateUserCurrentLocation();
        break;

      case USER_LOCATION_INFORMATION_ACCESS_STATE.denied:
        setUserLocationRequestButtonIcon('unavailable');
        showToast(gettext('home.toast.warning.location_information_access_not_granted'), 'warning');
        break;

      case USER_LOCATION_INFORMATION_ACCESS_STATE.unavailable:
        // Nothing we can do here as the user agent doesn't support the
        // GeoLocation API.
        break;
    }
  });
}


function requestCurrentLocation(options) {
  return new Promise(function (resolve, reject) {
    navigator.geolocation.getCurrentPosition(
      // Callback executed passing the new ``Position`` object, reflecting the
      // current location of the device.
      function (location) {
        resolve(location);
      },

      function (positionError) {
        reject(positionError);
      },

      {
        enableHighAccuracy: options.enableHighAccuracy || false,
        maximumAge: options.maximumAge || Infinity,
        timeout: options.timeout || Infinity
      });
  });
}


/**
 * Return the access state of the user's location information.
 *
 *
 * @return: a ``Promise`` that resolves to a
 *     ``USER_LOCATION_INFORMATION_ACCESS_STATE``.
 */
function requestUserLocationInformationAccessState() {
  return new Promise(function (resolve, reject) {
    // Check whether the user agent supports the GeoLocation API.
    if (!isLocationAccessSupported()) {
      resolve(USER_LOCATION_INFORMATION_ACCESS_STATE.unavailable);
    }

    // Check whether the user agent supports the Permission API.
    if (!isPermissionAPISupported()) {
      resolve(USER_LOCATION_INFORMATION_ACCESS_STATE.unknown);
    }

    // Query the user permission status for GeoLocation API.
    navigator.permissions.query({ name: 'geolocation' }).then(function (result) {
      resolve(USER_LOCATION_INFORMATION_ACCESS_STATE.parseString(result.state));
    });
  });
}


/**
 * Reset the bouncing animation to the marker of the currently
 * highlighted sports center.
 */
function resetHighlightedSportsCenterMarkerBouncingAnimation() {
  google.maps.event.addListenerOnce(mMap, 'idle', function (event) {
    setTimeout(function () {
      // Check whether the sports center is still highlighted after a few
      // hundred milliseconds.
      if (mHighlightedSportsCenterId != null) {
        let sportsCenter = mSportsCenters[mHighlightedSportsCenterId];
        if (sportsCenter != null) {
          sportsCenter.marker.setAnimation(google.maps.Animation.BOUNCE);
        }
      }
    }, 750);
  });
}


/**
 * Set the specified icon to the button used to request the user's
 * current location.  This icon represents the current state of this
 * button.
 *
 *
 * @param iconName: the name of the icon to set to the button.  This
 *    name corresponds to the file name of this icon.
 */
function setUserLocationRequestButtonIcon(iconName) {
  $('#searchLocationButton').css('background-image', 'url(/static/img/ic_location_' + iconName + '.svg)');
}


/**
 * Fetch a list of sports centers of the specified kind of sport located
 * near the user's current location.
 *
 *
 * @param sport: an item of the enumeration ``Sport``.
 *
 * @param location: the location to find sports centers nearby.
 */




/**
 * Request the user's current location, search and display sports centers
 * nearby with the current selected sport (cf. global variable
 * ``mSelectedSport``).
 *
 *
 * The function uses the global variable ``mIsUserCurrentLocationUpdateInProgress``
 * as a guard to avoid multiple entrance.
 *
 * The function updates the global variables ``mUserCurrentLocation`` and
 * ``mUserCurrentLocationAccuracy`` with the user's current location and
 * the accuracy in meters of the measure.
 */
function updateUserCurrentLocation() {
  if (!mIsUserCurrentLocationUpdateInProgress) {
    mIsUserCurrentLocationUpdateInProgress = true;

    // Clear the identification of the sports center that was highlighted.
    mHighlightedSportsCenterId = null;

    // Clear the edit field that displays the previously selected sports
    // center.
    clearSportsCenterEditField();

    // Clear the cache of sports centers as we are fetching fresh new
    // information about sports centers near the user's current location.
    clearSportsCentersCache();

    requestCurrentLocation({
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 20000
      }).then(
      function (position) {
        // Cache the estimated current location of the user and the accuracy
        // of the measure.
        mUserCurrentLocation = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
        mUserCurrentLocationAccuracy = position.coords.accuracy;

        // Display the current location of the user.
        displayUserCurrentLocation(mUserCurrentLocation, mUserCurrentLocationAccuracy);

        // Pan the map to the user's current's location and zoom in to a closer
        // view.
        mMap.panTo(mUserCurrentLocation);
        google.maps.event.addListenerOnce(mMap, "idle", function () {
          mMap.setZoom(MAP_ZOOM_CLOSEUP_LEVEL);
        });

        // Set the location button's icon to indicate that the user's current
        // location is known.
        setUserLocationRequestButtonIcon('found');

        // Fetch the list of sport centers nearby the location of the user and
        // update the user interface accordingly.
        suggestSportsCenters(mSelectedSport, mUserCurrentLocation);

        mIsUserCurrentLocationUpdateInProgress = false;
      },
      function (error) {
        if (error.code == GEOLOCATION_ERROR_PERMISSION_DENIED) {
          setUserLocationRequestButtonIcon('unavailable');
          showToast(gettext('home.toast.warning.location_information_access_not_granted'), 'warning', {timeout: 8000});
        } else {
          setUserLocationRequestButtonIcon('compass');
          enableRotationAnimation($('#searchLocationButton'));
          showToast(gettext('home.toast.error.unexpected_location_error'), 'error');
        }

        mIsUserCurrentLocationUpdateInProgress = false;
      });
  }
}



// Called whenever the page's Document Object Model (DOM) becomes safe
// to manipulate.  This is the good time to perform initialization tasks
// that are needed before the user views or interacts with the page.
$(document).ready(function () {
  initializeHomePage();
});




/**
 * Indicate whether the user is authenticated.
 * @todo: move this helper function to a service file.
 *
 *
 * @return: ``true`` if the user has logged in, ``false`` otherwise.
 */
function isUserAuthenticated() {
  return typeof Cookies.get('account_id') !== 'undefined';
}

