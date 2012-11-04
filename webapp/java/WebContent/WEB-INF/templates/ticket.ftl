<h2>${ticket.artistName} : ${ticket.name}</h2>
<ul>
<#list variations as variation>
<li class="variation">
  <form method="POST" action="/buy">
      <input type="hidden" name="ticket_id" value="${ticket.id}">
      <input type="hidden" name="variation_id" value="${variation.id}">
      <span class="variation_name">${variation.name}</span> 残り<span class="vacancy" id="vacancy_${variation.id}">${variation.vacancy?c}</span>席
    <input type="text" name="member_id" value="">
    <input type="submit" value="購入">
  </form>
</li>
</#list>
</ul>

<h3>席状況</h3>
<#assign minindex = 0>
<#assign maxindex = 63>
<#list variations as variation>
<h4>${variation.name}</h4>
<table class="seats" data-variationid="${variation.id}">
<#list minindex..maxindex as row>
<tr>
<#list minindex..maxindex as col>
<#assign stockkey = "" + row?string?left_pad(2, "0") + "-" +  col?string?left_pad(2, "0")>
<td id="${stockkey}" class="${variation.stocks[stockkey]?string('unavailable', 'available')}"></td>
</#list>
</tr>
</#list>
</table>
</#list>
