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
 * Add the specified sports centers into the cache.
 *
 *
 * @param sportsCenters: a list of instance of sports center.
 */
function addSportsCentersToCache(sportsCenters) {
  // Add these sports centers to the cache.
  sportsCenters.reduce(
    (map, sportsCenter) => (map[sportsCenter.place_id] = sportsCenter, map),
    mSportsCenters);

  // Add each sports center to their corresponding group of sport.
  for (let sportsCenter of sportsCenters) {
    if (typeof mSportsCentersBySport[sportsCenter.sport] === 'undefined') {
      mSportsCentersBySport[sportsCenter.sport] = [];
    }

    mSportsCentersBySport[sportsCenter.sport].push(sportsCenter);
  }
}


/**
 * Build the formatted address from a dictionary of address components.
 *
 *
 * @param address: a dictionary of address components where the key
 *     corresponds to component type (such as ``street_name``, ``district``,
 *     etc.) and the value corresponds to the localised textual content
 *     for this specific address component.
 *
 *
 * @return: a string representing the formatted address.
 */
function buildFormattedAddress(address) {
  const ADDRESS_COMPONENTS = [
    address.house_number,
    address.street_name,
    address.ward,
    address.district,
    //address.city, @note: not useful as the address is displayed in the context of a city.
  ];

  let components = ADDRESS_COMPONENTS.filter(function (component) {
    return component != null;
  });

  return components.join(', ');
}


/**
 * Build the HTML element that represents a suggested sports center that
 * is displayed as an item in the corresponding selection list of the
 * user interface.
 *
 *
 * @param sportsCenter: an instance of a sports center.
 *
 * @param isListItem: indicate whether this HTML element needs to be an
 *     item in a list, in which case the function will grab the HTML
 *     element in a DIV.
 *
 *
 * @return: a list item  HTMLelement corresponding to the specified
 *     sports center.
 */
function buildSportsCenterHtmlElement(sportsCenter, isListItem) {
  // Build the HTML element corresponding to this sports center.
  let name = sportsCenter.address.recipient_name;
  let formattedAddress = buildFormattedAddress(sportsCenter.address);

  let contentString = '<i class="icon__map-maker"></i>' +
    '<span class="place__name">'+ name + '</span>' +
    '<span class="place__address">'+ formattedAddress + '</span>' +
    '</li>';

  if (isListItem) {
    contentString = '<li id-target="' + sportsCenter.place_id + '">' + contentString + '</li';
  }

  // Setup the listeners to be notified when the user moves the mouse
  // cursor over or out of this HTML element, or when he clicks on it.
  let htmlElement = $(contentString);

  if (isListItem) { // @todo: fix this patch.
    htmlElement.mouseenter(function () {
      let sportsCenterId = $(this).attr('id-target');
      onMouseOverSuggestedSportsCenter(sportsCenterId);
    });

    htmlElement.mouseleave(function () {
      let sportsCenterId = $(this).attr('id-target');
      onMouseOutSuggestedSportsCenter(sportsCenterId);
    });

    htmlElement.click(function () {
      let sportsCenterId = $(this).attr('id-target');
      mSelectedSportsCenterId = sportsCenterId;
    });
  }

  // Return the build HTML element.
  return htmlElement;
}


/**
 * Calculate the route from the user's current location to the specified
 * sports center.
 *
 *
 * @param sportsCenter: an instance representing a sports center.
 *
 *
 * @return: an instance ``Promise`` that resolves to an array of
 *     instances ``google.maps.LatLng``.
 */
function calculateRoute(sportsCenter) {
  return new Promise(function (resolve, reject) {
    let directionsService = new google.maps.DirectionsService();

    directionsService.route({
      destination: new google.maps.LatLng(sportsCenter.entrance.latitude, sportsCenter.entrance.longitude),
      origin: mUserCurrentLocation,
      provideRouteAlternatives: false,
      travelMode: google.maps.DirectionsTravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.METRIC
    }, function (response, status) {
      if (status === 'OK') {
        if (response.routes.length > 0) {
          resolve(response.routes[0].overview_path);
        }
      } else {
        reject(status);
      }
    });
  });
}


/**
 * Clear the sports center edit field that is used to display the
 * selected sports center, and hide the button that allows the user
 * to clear this edit field.
 */
function clearSportsCenterEditField() {
  mSelectedSportsCenterId = null;

  // Hide the placeholder used to display the sports center that was
  // selected by the user.
  let sportsCenterEditFieldPlaceholder = $('#placeHolderPlace');
  sportsCenterEditFieldPlaceholder.hide();

  // Clear the sports center identification from the target of the button
  //  used to clear the selected sports center, and hide this button.
  let sportsCenterEditFieldClearButton = $('#removeAddress');
  sportsCenterEditFieldClearButton.attr('id-target-hold', null);
  sportsCenterEditFieldClearButton.hide();
}


/**
 * Wipe the cache from any sports centers instances that have been
 * downloaded from the server platform.  Cleanse the map from the markers
 * and the paths of these sports centers.
 */
function clearSportsCentersCache() {
  Object.keys(mSportsCenters).forEach(function (sportsCenterId, index) {
    hideSportsCenter(mSportsCenters[sportsCenterId]);
  });

  // Clear the sports center caches.
  mSportsCenters = {};
  mSportsCentersBySport = [];
  mSportsCenterRoutePolylines = {};
}


/**
 * Stop playing the rotation animation to the specified HTML element.
 *
 *
 * @param element: a HTML element to stop play the rotation animation to.
 */
function disabledRotationAnimation(element) {
  element.removeClass('animate--rotate');
}


/**
 * Display markers that identify the location on the map of the specified
 * sports centers.
 *
 * The function is responsible for creating and caching instances of
 * marker, and reusing cached instances.
 *
 *
 * @param sportsCenters: a list of sports centers instances to display the
 *     markers on the map.
 */
function displaySportsCenterMarkers(sportsCenters) {
  for (let sportsCenter of sportsCenters) {
    let sportsCenterlocation = sportsCenter.location;

    // Create a new marker instance if not yet built and attached to this
    // sports center.
    if (sportsCenter.marker == null) {
      let isSportsCenterVerified = (sportsCenter.object_status == 'enabled');

      sportsCenter.marker = new google.maps.Marker({
        icon: '/static/img/'+ 'ic_marker_sport_' + sportsCenter.sport + (isSportsCenterVerified ? '' : '--disabled') + '.png',
        map: mMap,
        position: new google.maps.LatLng(sportsCenterlocation.latitude, sportsCenterlocation.longitude),
        visible: true
      });

      // Add a listener to receive event that is fired when the marker icon was
      // clicked.
      sportsCenter.marker.addListener('click', function () {
        onSportsCenterMarkerMouseClick(sportsCenter.place_id);
      });

      // Add a listener to receive event that is fired when the mouse enters
      // the area of the marker icon.
      sportsCenter.marker.addListener('mouseover', function () {
        onSportsCenterMarkerMouseEnter(sportsCenter.place_id);
      });

      // Add a listener to receive event that is fired when the mouse leaves
      // the area of the marker icon.
      sportsCenter.marker.addListener('mouseout', function () {
        onSportsCenterMarkerMouseLeave(sportsCenter.place_id);
      });

    // Reuse the cached version of the instance marker attached to this
    // sports center.  Simply make it visible on the map.
    } else {
      sportsCenter.marker.setVisible(true);
    }
  }
}


/**
 * Display the route from the user's current location to the specified
 * sports center, including the possible access path from the entrance of
 * this sports center to its centroid location.
 *
 * This function is responsible for creating and caching polyline
 * instances representing the route, and reusing cached instances.
 *
 *
 * @param sportsCenter: an instance of the sports center to display the
 *    route from the user's current location to the entrance of this
 *    sports center.
 */
function displaySportsCenterRoute(sportsCenter) {
  // Retrieve the polyline representing the route from the user's current
  // location to the sports center's entrance.
  let routePolyline = mSportsCenterRoutePolylines[sportsCenter.place_id];
  routePolyline.setVisible(true);

  // Check whether this sports center has a specific access path.  An
  // access path corresponds to a route between the sports center's main
  // entrance and the exact location of the sports center.
  if (typeof sportsCenter.access_path !== 'undefined') {
    // Check whether the polyline representing this access path has been
    // already built and cached.
    //
    // @note: this acces path is independant from the user's location, hence
    //     it is cached into the sports center instance itself.
    if (typeof sportsCenter.accessPathPolyline === 'undefined') {
      // Create a dashed polyline representing the access path of this sports
      // center.
      let lineSymbol = {
        path: 'M 0,-1 0,1',
        scale: 1,
        strokeColor: '#4388e7',
        strokeOpacity: 1,
        strokeWeight: 4
      };

      let accessPath = [];
      for (let point of sportsCenter.access_path) {
        accessPath.push(new google.maps.LatLng(point[1], point[0]));
      }

      sportsCenter.accessPathPolyline = new google.maps.Polyline({
        icons: [{
          icon: lineSymbol,
          offset: '0',
          repeat: '10px'
        }],
        map: mMap,
        path: accessPath,
        strokeOpacity: 0,
        visible: true
      });
    } else {
      sportsCenter.accessPathPolyline.setVisible(true);
    }
  }

  // Set the viewport of the map to contain the given the user's current
  // location, the entrance and the centroid location of the sports center,
  // the route from the user's current location to the sports center's
  // entrance, and the possible access path from this entrance to the
  // exact location of the sports center.
  fitMapBoundsToSportsCenterRoute(sportsCenter);
}


/**
 * Display the user's current location.
 *
 *
 * @param position: an instance ``google.maps.LatLng`` representing the
 *     position of the concerned device at a given time.
 *
 * @param accuracy: accuracy expressed in meters of the measure of the
 *     position of the concerned device at a given time.
 */
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


/**
 * Play the rotation animation to the specified HTML element.
 *
 *
 * @param element: a HTML element to play the rotation animation to.
 */
function enableRotationAnimation(element) {
  element.addClass('animate--rotate');
}


function enterSportCenterFocus(sportsCenterId) {
  // Set the identification of the current highlighted sports center.
  mHighlightedSportsCenterId = sportsCenterId;

  // Animate the marker of the selected sports center with a bouncing
  // effect.
  let sportsCenter = mSportsCenters[sportsCenterId];
  sportsCenter.marker.setAnimation(google.maps.Animation.BOUNCE);

  // Display the route from the user's current location to the entrance
  // of the selected sports center.  This route may have been already
  // cached.
  let sportsCenterDirectionPolyline = mSportsCenterRoutePolylines[sportsCenterId];

  if (typeof sportsCenterDirectionPolyline === 'undefined') {
    // Calculate the route from the user's current location and the sports
    // center's entrance.
    calculateRoute(sportsCenter).then(function (path) {
      // Cache the polyline that represents the route between the user's
      // current location and the sports center's entrance, for further usage.
      //
      // @todo: store this route to the server platform to avoid further
      //     redondant calculations, which are billed by Google.
      mSportsCenterRoutePolylines[sportsCenter.place_id] = new google.maps.Polyline({
        clickable: false,
        draggable: false,
        editable: false,
        geodesic: true,
        path: path,
        map: mMap,
        strokeColor: '#4388e7',
        strokeOpacity: 0.8,
        strokeWeight: 4,
        visible: false
      });

      // Check whether this sports center corresponds to the sports center
      // currently selected by the user.  If not, this is probably because the
      // has changed his selection in the meantime, in which case we don't
      // not need to display the route anymore.
      if (typeof mHighlightedSportsCenterId === 'undefined' || sportsCenter.place_id == mHighlightedSportsCenterId) {
        displaySportsCenterRoute(sportsCenter);
      }
    });
  } else {
    displaySportsCenterRoute(sportsCenter);
  }
}


/**
 * Set the map viewport to contain the route from the user's current
 * location to the entrance of the sports center, including the possible
 * access path from the sports center's entrance to the centroid location
 * of this sports center.
 *
 *
 * @param sportsCenter: an instance of a sports center.  The polylines
 *     representing the route from the user location to the entrance of
 *     the sports center and the access path from the sports center's
 *     entrance to the centroid location of this sports center MUST have
 *     built.
 */
function fitMapBoundsToSportsCenterRoute(sportsCenter) {
  // Retrieve the polyline representing the route from the user's current
  // location to the sports center's entrance.
  let routePolyline = mSportsCenterRoutePolylines[sportsCenter.place_id];

  // Set the viewport of the map to contain the user's current location,
  // the entrance and the centroid location of the sports center.
  let mapBounds = new google.maps.LatLngBounds();
  mapBounds.extend(mUserCurrentLocation);
  mapBounds.extend(new google.maps.LatLng(sportsCenter.location.latitude, sportsCenter.location.longitude));
  mapBounds.extend(new google.maps.LatLng(sportsCenter.entrance.latitude, sportsCenter.entrance.longitude));

  // Include every point of the route from the user's current location to
  // the sports center's entrance.
  for (let point of routePolyline.getPath().getArray()) {
    mapBounds.extend(point);
  }

  // Include every point of the possible access path from the sports
  // center's entrance to the exact location of the sports center.
  if (sportsCenter.accessPathPolyline != null) {
    for (let point of sportsCenter.accessPathPolyline.getPath().getArray()) {
      mapBounds.extend(point);
    }
  }

  mMap.fitBounds(mapBounds);
}


/**
 * Set the map viewport to contain the user's current location, and the
 * entrance and centroid location of the specified sports centers.
 *
 *
 * @param sportsCenter: a list of sports center instances.
 */
function fitMapBoundsToSportsCenters(sportsCenters) {
  // Set the viewport of the map to contain the user's current location.
  let mapBounds = new google.maps.LatLngBounds();
  mapBounds.extend(mUserCurrentLocation);

  // Extend the bounds of the map to the entrance and the centroid location
  // of the sports center.
  for (let sportsCenter of sportsCenters) {
    mapBounds.extend(new google.maps.LatLng(sportsCenter.entrance.latitude, sportsCenter.entrance.longitude));
    mapBounds.extend(new google.maps.LatLng(sportsCenter.location.latitude, sportsCenter.location.longitude));
  }

  mMap.fitBounds(mapBounds);
}


/**
 * Return the approximate number of meters represented by one (1) pixel
 * on the Google Maps.
 *
 *
 * @param map: an instance ``google.maps.Map``.
 *
 *
 * @return: the number of meters per pixel displayed on the map at the
 *     current zoom level of this map.
 */
function getApproximateMetersPerPixel(map) {
  // The resolution of a map with the mercator projection (like Google Maps)
  // is dependent on the latitude.  This is based on the assumption that
  // the Earth's radius is 6,378,137 meters.
  // [Chris Broadfoot; Google Developer; https://twitter.com/broady]
  return 156543.03392 * Math.cos(map.getCenter().lat() * Math.PI / 180) / Math.pow(2, map.getZoom());
}


/**
 * Hide the specified sports center from the map.
 *
 *
 * @param sportsCenter: an instance of a sport center.
 */
function hideSportsCenter(sportsCenter) {
  // Hide the route from the user's previous location to the entrance of
  // this sports center.
  let routePolyline = mSportsCenterRoutePolylines[sportsCenter.place_id];
  if (routePolyline != null) {
    routePolyline.setVisible(false);
  }

  // Hide the access path from the entrance of this sports center to its
  // centroid location.
  if (sportsCenter.accessPathPolyline != null) {
    sportsCenter.accessPathPolyline.setVisible(false);
  }

  // Hide the marker of this sports center and clear its animation.
  if (sportsCenter.marker != null) {
    sportsCenter.marker.setVisible(false);
    sportsCenter.marker.setAnimation(null);
  }
}


function initializeSportSelectionButton() {
  // Identify the sport that is currently selected in the user interface.
  mSelectedSport = $('#sportTypeSelected').val();

  // Disable from the sport selection panel the sport that is currently
  // selected.
  $('#sportType__list').find('li[name=' + mSelectedSport + ']').height(0);

  // Setup a listener to be notified when the user clicks on the button
  // used to access the sport selection panel.
  let sportSelectionButton = $('#sportType-selected');
  sportSelectionButton.on('click', function () {
    onSportSelectionButtonClicked();
  });

  // Setup a listener on each sport selection item of the corresponding
  // panel to be notified when the user clicks one of them.  This will
  // update the content of the sport selection panel and trigger an event
  // to inform that the sport selection has changed.
  let sportSelectionPanelItems = $('#sportType__list .sportType__item');
  sportSelectionPanelItems.each(function () {
    $(this).on('click', function () {
      onSportSelectionPanelItemClicked(this);
    });
  });
}


function initializeDateTimePicker() {
  // Configure the booking date picker widget.
  $('#search-date').datepicker({
    maxDate: moment(),
    locale: moment().local('en'),
    format: 'dd MM yyyy',
    gotoCurrent: true,
    startDate: '-3d',
    autoclose: true,
    todayHighlight: true,
    orientation: "top left"
  });

  // Configure the booking start time picker widget so that the default
  // start time of the booking period is one (1) hour later today.
  $('#search-time-start').clockpicker({
    placement: 'top',
    align: 'right',
    autoclose: true,
    'default': moment().add(1, 'hours').format('HH') + ':00'
  });

  // Configure the booking end time picker widget.
  $('#search-time-finish').clockpicker({
    placement: 'top',
    align: 'right',
    autoclose: true,
    'default': 'now'
  });

  $('#time-placeholder').on('click', function () {
    $(this).hide();
    $('.search__time-wrap').show();
    $('#search-date').datepicker('show');
  });


  // Setup a listener to be notified when the user has selected a booking
  // date.
  $('#search-date').on('change', function () {
    let bookingDate = $(this).data('datepicker').getFormattedDate('yyyy-mm-dd');
    let bookingStartTime = moment().format('HH') + ':00';
    let bookingStartDateTime = moment(bookingDate + ' ' + bookingStartTime);

    $('#search-time-start').clockpicker('show');
  });

  $('#search-time-start').on('change', function () {
    onBookingStartTimeChanged(this);
  });

  $('#search-time-finish').on('change', function () {
    onBookingEndTimeChanged(this);
  });
}


/**
 * Initialize HTML elements of the Home page.
 *
 * The function initialize the global variable mSelectedSport with the
 * default sport selection of the user interface.
 */
function initializeHomePage() {
  // Initialise the button that allows the user to select another sport.
  initializeSportSelectionButton();

  // Initialise the button that allows the user to detect his current
  // location.
  initializeUserLocationRequestButton();

  // Initialise the panel that displays suggested sports centers.
  initializeSportsCenterSelectionPanel();

  // Initialise the panel that displays the date and time picker for
  // defining the booking period.
  initializeDateTimePicker();

  // Setup a listener to be notified when the user clicks on the button
  // to book a playing field at a given sports center.
  $('#btnSearch').on('click', function(event) {
    event.stopPropagation();
    onButtonSearchClicked($(this));
  });
}


/**
 * Initialize the panel that contains suggested sports centers of the
 * selected sport.
 */
function initializeSportsCenterSelectionPanel() {
  // Setup a listener to be notified when the user clicks on the sports
  // centers search edit field to toggle between showing and hiding the
  // suggested sports centers panel.
  let sportsCenterSearchEditField = $('#search-location');
  sportsCenterSearchEditField.on('click', function (event) {
    event.stopPropagation();
    console.log('Click in to open or close the list of suggested sports centers');
    $('#placeList').toggle();
  });

  // Setup a listener to be notified when the user clicks anywhere on the
  // window to automatically close the suggested sports centers panel.
  $(window).click(function (event) {
    $('#placeList').hide();
  });

  // Setup a listener to be notified when the user clicks on a suggested
  // sports center in the panel to retrieve the selected sport center and
  // to display it in the sports centers search edit field.
  $(document).on('click', '#placeList li', function (event) {
    event.stopPropagation();

    let selectedSportsCenterId = $(this).attr('id-target');
    displaySportsCenterEditFieldPlaceholder(selectedSportsCenterId);

//    let selectedSportsCenterItemHtml = $(this).html();
//    let selectedSportsCenterId = $(this).attr('id-target');
//
//    let sportsCenterEditFieldPlaceholder = $('#placeHolderPlace');
//    sportsCenterEditFieldPlaceholder.empty();
//    sportsCenterEditFieldPlaceholder.append(selectedSportsCenterItemHtml).show();
//
//    let sportsCenterEditFieldClearButton = $('#removeAddress');
//    sportsCenterEditFieldClearButton.show().attr('id-target-hold', selectedSportsCenterId);

    let suggestSportsCenterSelectionPanel = $('#placeList');
    suggestSportsCenterSelectionPanel.hide();
  });

  // Add a listener to be notified when the user clicks on the button to
  // clear the selected sports center from the search edit field.
  let sportsCenterEditFieldClearButton = $('#removeAddress');
  sportsCenterEditFieldClearButton.on('click', function (event) {
    event.stopPropagation();
    onSportsCenterEditFieldClearButtonClicked(this);
  });
}


function displaySportsCenterEditFieldPlaceholder(sportsCenterId) {
  let sportsCenterEditFieldPlaceholder = $('#placeHolderPlace');
  sportsCenterEditFieldPlaceholder.empty();
  sportsCenterEditFieldPlaceholder.append(buildSportsCenterHtmlElement(mSportsCenters[sportsCenterId])).show();

  let sportsCenterEditFieldClearButton = $('#removeAddress');
  sportsCenterEditFieldClearButton.show().attr('id-target-hold', sportsCenterId);
}


/**
 * Initialize the map when the Google Maps API is ready.  This function
 * MUST be passed as the callback parameter of the Google Maps API
 * JavaScript:
 *
 *      <script async differ
 *        src="https://maps.googleapis.com/maps/api/js?(...)&callback=initializeMap">
 *      </script>
 */
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


/**
 * Check whether the browser supports access to the location of the
 * device.
 *
 *
 * @return: ``true`` if the browser supports access to the location of
 *     the device, ``false`` otherwise.
 */
function isLocationAccessSupported() {
  // Nowadays, with modern browsers, access to the location of the user's
  // device is only in secure context (HTTPS).
  //
  // @note: On Firefox 24 and older versions, the expression
  //    ``"geolocation" in navigator`` always returned ``true`` even if the
  //    API was disabled. This has been fixed with Firefox 25 to comply
  //    with the spec. (bug 884921).
  return ((window.location.protocol === 'https:') && (typeof navigator.geolocation !== 'undefined'));
}


/**
 * Check whether the browser supports Permission API.
 *
 *
 * @note: this is an experimental technology.   Because this technology's
 *     specification has not stabilized, check the compatibility table
 *     for usage in various browsers.  Also note that the syntax and
 *     behavior of an experimental technology is subject to change in
 *     future versions of browsers as the specification changes.
 *     Reference: https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API
 *
 *
 * @return: ``true`` if the browser supports Permission API, ``false``
 *     otherwise.
 */
function isPermissionAPISupported() {
  return (typeof navigator.permissions !== 'undefined');
}


/**
 * Remove the focus from the specified sports center.
 *
 *
 * @param sportsCenterId: identification of a sports center that has the
 *     focus.
 */
function leaveSportCenterFocus(sportsCenterId) {
  let sportsCenter = mSportsCenters[sportsCenterId];

  // Clear the identification of the current highlighted sports center.
  mHighlightedSportsCenterId = null;

  // Hide the polyline representing the route from the user's current
  // location to the entrance of the sport center.
  let routePolyline = mSportsCenterRoutePolylines[sportsCenterId];
  if (typeof routePolyline !== 'undefined') {
    routePolyline.setVisible(false);
  }

  // Hide the polyline representing the access path from the entrance of
  // the sports center to the exact location of this sports center.
  if (sportsCenter.accessPathPolyline != null) {
    sportsCenter.accessPathPolyline.setVisible(false);
  }

  // Deactivate the bouncing animation of the marker of the sports center.
  sportsCenter.marker.setAnimation(null);

  // Set the viewport of the map to zoom out to the entrances and centroid
  // locations of the suggested sports centers, and the user's current
  // location.
  fitMapBoundsToSportsCenters(mSportsCentersBySport[mSelectedSport]);
}


/**
 * Called whenever the user changed the start time of the booking period.
 * The function automatically updates the end time of this period.
 *
 *
 * @param bookingStartTimeClockPicker: the HTML element corresponding to
 *     the clock picker used to define the start time of the booking
 * period.
 */
function onBookingStartTimeChanged(bookingStartTimeClockPicker) {
  let bookingDuration = (mBookingStartDateTime == null || mBookingEndDateTime == null)
    ? DEFAULT_BOOKING_DURATION
    : moment.duration(mBookingEndDateTime.diff(mBookingStartDateTime)).asHours();

  let bookingDate = $('#search-date').data('datepicker').getFormattedDate('yyyy-mm-dd');
  let bookingStartTime = $(bookingStartTimeClockPicker).val();
  mBookingStartDateTime = moment(bookingDate + ' ' + bookingStartTime);

  mBookingEndDateTime = mBookingStartDateTime.clone().add(bookingDuration, 'hours');

  $('#search-time-finish').val(mBookingEndDateTime.format('HH:mm'));
}


/**
 * Called whenever the user changed the end time of the booking period.
 * The function updated the duration of the booking period.
 *
 */
function onBookingEndTimeChanged(bookingEndTimeClockPicker) {
  let bookingDate = $('#search-date').data('datepicker').getFormattedDate('yyyy-mm-dd');
  let bookingEndTime = $(bookingEndTimeClockPicker).val();
  mBookingEndDateTime = moment(bookingDate + ' ' + bookingEndTime);
}


/**
 * Called whenever the user clicks on the button to log in.
 *
 *
 * @param button: the HTML component corresponding to the booking button.
 */
function onButtonSearchClicked(button) {
  if (mBookingStartDateTime == null) {
    // @todo: replace with a function openStartDateTimePicker.
    showToast(gettext('home.toast.warning.booking_date_time_is_required'), 'warning');
    $('#time-placeholder').hide();
    $('.search__time-wrap').show();
    $('#search-date').datepicker('show');
    return;
  }

  if (mSelectedSportsCenterId == null) {
    showToast(gettext('home.toast.warning.sports_center_is_required'), 'warning');

    if (typeof mSportsCentersBySport[mSelectedSport] !== 'undefined') {
      // Open the suggested sports centers panel.
      let suggestedSportsCenterSelectionPanel = $('#placeList');
      suggestedSportsCenterSelectionPanel.show();
    }

    return;
  }

  if (!isUserAuthenticated()) {
    openLoginModalDialogBox();
    return;
  }

  enableWaitingAnimation(button);
}

/**
 * Called whenever the bounds of the map changed.
 */
function onMapBoundsChanged() {
  // [PATCH] Google Maps API v3 has a strange bug when starting to bounce
  // a marker while the bounds of the map changed, meaning the map has been
  // panning and/or zooming: the marker may bounces only one time and stops
  // bouncing.  This behaviour seems to be random.
  //
  // We found that waiting for the event "bounds_changed", then waiting for
  // the event that is fired when the map becomes idle after panning or
  // zooming, then waiting for a short period of time, setting the bounce
  // animation (which was actually already set!), fix this issue.
  if (mHighlightedSportsCenterId != null) {
    resetHighlightedSportsCenterMarkerBouncingAnimation();
  }
}


/**
 * Called whenever the zoom level of the map has changed.
 *
 * The function needs to update the scale of the circle that represents
 * the current location of the user, and the accuracy of this location.
 */
function onMapZoomChanged() {
 if (mUserCurrentLocationMarker != null && mUserCurrentLocation != null) {
  let icon = mUserCurrentLocationMarker.getIcon();
  icon.scale = Math.round(mUserCurrentLocationAccuracy / getApproximateMetersPerPixel(mMap, mUserCurrentLocation));
  mUserCurrentLocationMarker.setIcon(icon);
 }
}


/**
 * Called whenever the mouse pointer is moved out of an item representing
 * a sports center in the list of suggested sports centers.
 *
 *
 * @param sportsCenterId: identification of the sports center that the
 *     mouse pointed is moved out.
 */
function onMouseOutSuggestedSportsCenter(sportsCenterId) {
// Check whether the user has selected the specified sport center, in
// which case we need to keep this sports center in focus.
  if (sportsCenterId != mSelectedSportsCenterId) {
    leaveSportCenterFocus(sportsCenterId);
  }
}


/**
 * Called whenever the mouse pointer is moved onto an item representing
 * a sports center in the list of suggested sports centers.
 *
 *
 * @param sportsCenterId: identification of the sports center that the
 *     mouse pointed is moved onto.
 */
function onMouseOverSuggestedSportsCenter(sportsCenterId) {
  if (mHighlightedSportsCenterId != sportsCenterId) {
    enterSportCenterFocus(sportsCenterId);
  }
}


/**
 * Called whenever the user clicks on the button to clear his current
 * sports center selection.
 *
 *
 * @param button: the button the user clicked on.
 */
function onSportsCenterEditFieldClearButtonClicked(button) {
  let sportsCenterId = $(button).attr('id-target-hold');

  // Clear the content of the sports center edit field.
  clearSportsCenterEditField();

  // Open the suggested sports centers panel.
  let suggestedSportsCenterSelectionPanel = $('#placeList');
  suggestedSportsCenterSelectionPanel.show();

  // Leave the focus on the previous selected sports center.
  leaveSportCenterFocus(sportsCenterId);
}


/**
 * Called whenever the user clicks on the button that opens or closes
 * the sport selection panel.  The function toggles the visibility of
 * this panel.
 */
function onSportSelectionButtonClicked() {
  $('#sportType__list').toggle();
}


/**
 * Called whenever the user selects another sport.
 *
 *
 * @param sport: the sport that the user has selected.
 */
function onSportSelectionChanged(sport) {
  // Clear the identification of the previously highlighted sports center.
  mHighlightedSportsCenterId = null;

  // Clear the sports center edit field (search bar), if the user has
  // previously selected a sports center.
  if (mSelectedSportsCenterId != null) {
    clearSportsCenterEditField();
    mSelectedSportsCenterId = null;
  }

  // Hide from the map the previous sports centers that were displayed on
  // the map.
  if (mSportsCentersBySport[mSelectedSport] != null) {
    for (let sportsCenter of mSportsCentersBySport[mSelectedSport]) {
      hideSportsCenter(sportsCenter);
    }
  }

  // Set the sport that the user selected.
  mSelectedSport = sport;

  // Fetch the list of suggested sports centers if currently empty, or
  // display it right away if already fetched.
  let sportsCenters = mSportsCentersBySport[sport];

  if (typeof sportsCenters === 'undefined') {
    suggestSportsCenters(sport, mUserCurrentLocation);
  } else if (sportsCenters.length == 0) {
    showToast(gettext('home.toast.warning.no_sports_center_registered_near_the_location'), 'warning');
  } else {
    console.log('[DEBUG] Suggested sports centers already cached for ' + sport);
    displaySportsCenterMarkers(sportsCenters);
    fitMapBoundsToSportsCenters(sportsCenters);
    populateSuggestedSportsCenterSelectionPanel(sportsCenters);
  }
}


/**
 * Called whenever the user clicks on one item of the sport selection
 * panel to change the sport selection.
 *
 * The function sets the icon of the button used to open or close the
 * sport selection panel with the icon of the sport that the user clicked
 * on.
 *
 * The function hides the item corresponding to the sport the user
 * clicked on, and it shows the item the corresponding to the previously
 * selected sport.
 *
 * The function automatically closes the sport selection panel.
 *
 * The function calls the listener ``onSportSelectionChanged``.
 *
 *
 * @param sportSelectionPanelItem: the particular HTML item of the list
 *     the user clicked on.
 */
function onSportSelectionPanelItemClicked(sportSelectionPanelItem) {
  // Retrieve the last selected sport from the input HTML element (avoid
  // retrieving this information from the global variable mSelectedSport).
  let previouslySelectedSport = $('#sportTypeSelected').val();

  // Retrieve the sport the user just clicked on.
  let currentlySelectedSport = $(sportSelectionPanelItem).attr('name');

  // Close the sport selection panel right away so that all the subsequent
  // interface changes in the sport selection panel are not shown to the
  // user.
  $('#sportType__list').hide();

  // Update the icon of the button, which is used to open the sport
  // selection panel, with the icon of the sport that the user just
  // clicked on.
  let currentlySelectedSportIcon = $(sportSelectionPanelItem).find('i').attr('class');
  $('#sportType-selected').find('i').attr('class', currentlySelectedSportIcon);

  // Enable in the sport selection panel the sport that was previously
  // selected by the user and thus that was hided in the sport selection.
  $('#sportType__list').find('li[name=' + previouslySelectedSport + ']').height(48);

  // Disable from the panel selection the sport the user just clicked on.
  $(sportSelectionPanelItem).height(0);

  // Set the value of the input HTML element identifying the sport chosen
  // by the user to the currently selected sport.
  $('#sportTypeSelected').val(currentlySelectedSport);

  onSportSelectionChanged(currentlySelectedSport);
}


function onSportsCenterEditFieldClearMouseClick(sportsCenterId) {
}


function onSportsCenterEditFieldMouseClick(sportCenterId) {
}


function onSportsCenterEditFieldUserInput(sportsCenterId) {
}


/**
 * Called whenever the user clicks on the marker of sports center.  The
 * function selects this sports center on behalf of the user.
 *
 *
 * @param sportsCenterId: identification of a sports center.
 */
function onSportsCenterMarkerMouseClick(sportsCenterId) {
  if (mSelectedSportsCenterId != sportsCenterId) {
    // If the user has previously selected another sports center, clear this
    // previous selection.
    if (mSelectedSportsCenterId != null) {
      leaveSportCenterFocus(mSelectedSportsCenterId);
    }

    // Enter the select sports center and display its name and address in
    // the sports center selection edit field.
    mSelectedSportsCenterId = sportsCenterId;
    enterSportCenterFocus(sportsCenterId);
    displaySportsCenterEditFieldPlaceholder(sportsCenterId);
  }
}


/**
 * Called whenever the mouse cursor enters the area of a sports center's
 * marker.  The function display an info window above the marker to
 * indicate the name of this sports center.
 *
 *
 * @param sportsCenterId: identification of a sports center.
 */
function onSportsCenterMarkerMouseEnter(sportsCenterId) {
  let sportsCenter = mSportsCenters[sportsCenterId];

  if (sportsCenter.infoWindow == null) {
    sportsCenter.infoWindow = new google.maps.InfoWindow({
      content: sportsCenter.address.recipient_name
    });
  }

  sportsCenter.infoWindow.open(mMap, sportsCenter.marker);
}


/**
 * Called whenever the mouse cursor leaves the area of a sports center's
 * marker.  The function hides the info window above the marker that
 * indicate the name of this sports center.
 *
 *
 * @param sportsCenterId: identification of a sports center.
 */
function onSportsCenterMarkerMouseLeave(sportsCenterId) {
  let sportsCenter = mSportsCenters[sportsCenterId];
  sportsCenter.infoWindow.close();
}


function onSportsCenterPanelItemMouseClick(sportsCenterId) {
}

function onSportsCenterPanelItemMouseEnter(sportsCenterId) {
}

function onSportsCenterPanelItemMouseLeave(sportsCenterId) {
}


/**
 * Called whenever the user clicks on the button to update his current
 * location.
 *
 * The function requests information about the current location of the
 * user's device, unless:
 *
 * * the user has explicitly denied permission for the current origin to
 *   this information;
 *
 * * the user agent doesn't support the GeoLocation API.
 */
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


/**
 * Request the user agent to provide the current location of the user's
 * device.
 *
 *
 * @param options: an object containing option properties:
 *
 *     * ``enableHighAccuracy``: indicate the application would like to receive
 *       the best possible results. If ``true`` and if the device is able to
 *       provide a more accurate position, it will do so. Note that this can
 *       result in slower response times or increased power consumption (with a
 *       GPS chip on a mobile device for example). On the other hand, if ``false``,
 *       the device can take the liberty to save resources by responding more
 *       quickly and/or using less power. Default is ``false``.
 *
 *     * ``maximumAge``: a positive long value indicating the maximum age in
 *       milliseconds of a possible cached position that is acceptable to
 *       return. If set to ``0``, it means that the device cannot use a cached
 *       position and must attempt to retrieve the real current position. If
 *       set to ``Infinity`` the device must return a cached position
 *       regardless of its age. Default is ``0``.
 *
 *     * ``timeout``: positive long value representing the maximum length of
 *       time (in milliseconds) the device is allowed to take in order to
 *       return a position. The default value is ``Infinity``, meaning that the
 *       function won't provide any value until the position is available.
 *
 *
 * @return: a ``Promise`` that resolves to a ``Position``.
 */
function requestCurrentLocation(options) {
  return new Promise(function (resolve, reject) {
    navigator.geolocation.getCurrentPosition(
      // Callback executed passing the new ``Position`` object, reflecting the
      // current location of the device.
      function (location) {
        resolve(location);
      },

      // Optional callback executed when an error occurs, such as, for
      // instance, the user didn't accept to share the position of his device.
      //
      // @note: the ``PositionError`` interface represents the reason of an
      //     error occurring when using the geolocating device.  The read-only
      //     property ``code`` returns an unsigned short representing the error
      //     code.
      function (positionError) {
        reject(positionError);
      },

      // Optional properties used to detect the current location of the device.
      //
      // * ``enableHighAccuracy``: provide a hint that the application would like
      //   to receive the best possible results.  This may result in slower
      //   response times or increased power consumption.
      //
      // * ``maximumAge`` indicate that the application is willing to accept a
      //   cached position whose age is no greater than the specified time in
      //   milliseconds.
      //
      // * ``timeout``: denote the maximum length of time (expressed in
      //   milliseconds) that is allowed to pass from the call to geolocation
      //   function until the corresponding success callback is invoked.
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
function suggestSportsCenters(sport, location) {
  mSportsCenterService.searchSportsCentersByLocation({
    sport: sport,
    location: {
      longitude: location.lng(),
      latitude: location.lat()
    },
    includePending: true})
  .then(
    function (sportsCenters) {

      // If no sports centers have been found in a certain radius around the
      // specified location, display a warning and return.
      //
      // @todo: we should keep a trace there is no sports center registered
      //     near this location to avoid consecutive requests to the server,
      //     However, there is little chance that the user tries to request
      //     again for sports centers near this location.

      if (sportsCenters == null || sportsCenters.length == 0) {
        showToast(gettext('home.toast.warning.no_sports_centers_found'), 'warning', {timeOut: 10000});
      } else {
        addSportsCentersToCache(sportsCenters);

        displaySportsCenterMarkers(sportsCenters);
        fitMapBoundsToSportsCenters(sportsCenters);

        // Replace the content of select list HTML component with these sports
        // centers.
        populateSuggestedSportsCenterSelectionPanel(sportsCenters);
      }
    },
    function (error) {
      showToast(gettext('home.toast.error.unexpected_server_error'), 'error');
    }
  );
}


function populateSuggestedSportsCenterSelectionPanel(sportsCenters) {
  // Sort the suggested sports centers by furthest distance to the user's
  // current location so that they are displayed from the furthest to the
  // closest in the suggested sports centers panel. The REASON is that the
  // user needs to click on the sports centers search bar to open this
  // panel above this search bar, and therefore the mouse cursor is located
  // at this time just below to bottommost sports center item in the panel
  // which needs to be the closest to the user's current location. ;)
  sportsCenters.sort(function (a, b) {
    return (a.position < b.position) ? 1
      : ((a.position > b.position) ? -1 : 0);
  });

  let suggestedSportsCenterSelectionPanel = $('#placeList');
  suggestedSportsCenterSelectionPanel.empty();
  for (let sportsCenter of sportsCenters) {
    suggestedSportsCenterSelectionPanel.append(buildSportsCenterHtmlElement(sportsCenter, true));
  }
}

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

