<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>isucon 2</title>
    <link type="text/css" rel="stylesheet" href="/css/ui-lightness/jquery-ui-1.8.24.custom.css">
    <link type="text/css" rel="stylesheet" href="/css/isucon2.css">
    <script type="text/javascript" src="/js/jquery-1.8.2.min.js"></script>
    <script type="text/javascript" src="/js/jquery-ui-1.8.24.custom.min.js"></script>
    <script type="text/javascript" src="/js/isucon2.js"></script>
  </head>
  <body>
    <header>
      <a href="/">
        <img src="/images/isucon_title.jpg">
      </a>
    </header>
    <div id="sidebar">
<#if infos??>
      <table>
        <tr><th colspan="2">最近購入されたチケット</th></tr>
<#if (infos?size > 0) >
<#list infos as info >
        <tr>
          <td class="recent_variation">${info.artistName} ${info.ticketName} ${info.variationName}</td>
          <td class="recent_seat_id">${info.seatId}</td>
        </tr>
</#list>
</#if>
      </table>
</#if>
    </div>
    <div id="content">
<#include "${ftl}.ftl"> 
    </div>
  </body>
</html>
